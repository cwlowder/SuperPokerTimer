import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../utils/api";
import { Announcement, Player, Seat, Table } from "../types";

type TourneyDataOpts = {
  playerSearch?: string;   // optional search query for /api/players
  auto?: boolean;          // default true: load on mount and when search changes
};

export function useTourneyData(opts: TourneyDataOpts = {}) {
  const { playerSearch = "", auto = true } = opts;

  const [sounds, setSounds] = useState<string[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prevent overlapping loads
  const inFlightRef = useRef<Promise<void> | null>(null);

  const reload = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;

    setLoading(true);
    setError(null);

    const p = (async () => {
      try {
        const [snd, pls, tbs, sts, anns] = await Promise.all([
          apiGet<{ files: string[] }>("/api/sounds"),
          apiGet<Player[]>(`/api/players?q=${encodeURIComponent(playerSearch)}`),
          apiGet<Table[]>("/api/tables"),
          apiGet<Seat[]>("/api/seats"),
          apiGet<{ items: Announcement[] }>("/api/announcements?limit=50"),
        ]);

        setSounds(snd.files);
        setPlayers(pls);
        setTables(tbs);
        setSeats(sts);
        setAnnouncements(anns.items);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = p;
    return p;
  }, [playerSearch]);

  useEffect(() => {
    if (!auto) return;
    reload();
  }, [auto, reload]);

  const playersById = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, p])),
    [players]
  );

  const tablesById = useMemo(
    () => Object.fromEntries(tables.map((t) => [t.id, t])),
    [tables]
  );

  const seatsByTable = useMemo(() => {
    const m: Record<string, Seat[]> = {};
    for (const s of seats) (m[s.table_id] = m[s.table_id] || []).push(s);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.seat_num - b.seat_num);
    return m;
  }, [seats]);

  return {
    sounds,
    players,
    tables,
    seats,
    announcements,

    playersById,
    tablesById,
    seatsByTable,

    loading,
    error,
    reload,

    setAnnouncements, // useful if you want to overlay live announcements from WS
  };
}
