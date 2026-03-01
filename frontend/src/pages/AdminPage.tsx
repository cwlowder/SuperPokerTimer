// src/pages/AdminPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import TimerCard from "../components/TimerCard";
import SoundPlayer from "../components/SoundPlayer";
import { apiDelete, apiPatch, apiPost, apiPut } from "../utils/api";
import { Announcement, Player, Seat, Level, Table } from "../types";
import { useEventStream } from "../hooks/useEventStream";
import { useTourneyData } from "../hooks/useTourneyData";
import { AdminHeader, AdminTabs, Tab } from "../components/admin/common";
import { TimerTab } from "../components/admin/timerTab";
import { PlayersTab } from "../components/admin/playersTab";
import { TablesTab } from "../components/admin/tablesTab";
import { SettingsTab } from "../components/admin/settingsTab";
import { LevelsTab } from "../components/admin/levelsTab";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("timer");

  const { settings, state, remainingMs, lastSound, announcements: liveAnnouncements, connected, timerStatus } = useEventStream();

  const [search, setSearch] = useState("");
  const [soundPreview, setSoundPreview] = useState<{ file: string | null; playId: number } | null>(null);
  const [levelsDraft, setLevelsDraft] = useState<Level[]>([]);
  const [levelsDirty, setLevelsDirty] = useState(false);
  const [seatFlash, setSeatFlash] = useState<{ nonce: number; keys: string[] }>({ nonce: 0, keys: [] });

  useEffect(() => {
    if (!settings) return;
    if (!levelsDirty) setLevelsDraft(settings.levels ?? []);
  }, [settings, levelsDirty]);

  const { sounds, players, tables, announcements, playersById, tablesById, seatsByTable, error, reload, setAnnouncements } =
    useTourneyData({ playerSearch: search, auto: true });

  const seatByPlayer = useMemo(() => {
    const out: Record<string, { tableId: string; tableName: string; seatNum: number }> = {};
    for (const seats of Object.values(seatsByTable ?? {})) {
      for (const s of seats) {
        if (!s.player_id) continue;
        out[s.player_id] = {
          tableId: s.table_id,
          tableName: (s as any).table_name ?? tablesById?.[s.table_id]?.name ?? "",
          seatNum: s.seat_num
        };
      }
    }
    return out;
  }, [seatsByTable, tablesById]);

  const err = error;

  useEffect(() => {
    if (liveAnnouncements.length === 0) return;

    setAnnouncements((prev) => {
      const merged = [...liveAnnouncements, ...(prev ?? [])];

      // keep newest first
      merged.sort((a, b) => b.created_at_ms - a.created_at_ms);

      return merged;
    });
  }, [liveAnnouncements, setAnnouncements]);

  // ---- Timer controls ----
  const timerPause = async () => apiPost("/api/timer/pause");
  const timerResume = async () => apiPost("/api/timer/resume");
  const timerReset = async () => apiPost("/api/timer/reset_level");
  const timerAdd = async (ms: number) => apiPost(`/api/timer/add_time?delta_ms=${ms}`);
  const timerGo = async (idx: number) => apiPost(`/api/timer/go_to_level?level_index=${idx}`);

  // ---- Players ----
  const addPlayer = async (name?: string) => {
    if (!name) return;

    await apiPost("/api/players", { name });

    await reload();
  };

  const toggleElim = async (p: Player) => {
    await apiPatch(`/api/players/${p.id}`, { eliminated: !p.eliminated });
    await reload();
  };

  const renamePlayer = async (p: Player, name: string) => {
    const nm = (name || "").trim().replace(/\s+/g, " ");
    if (!nm) return;
    if (nm === p.name) return;
    await apiPatch(`/api/players/${p.id}`, { name: nm });
    await reload();
  };
  const deletePlayer = async (p: Player) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    await apiDelete(`/api/players/${p.id}`);
    await reload();
  };

  // ---- Tables ----
  const addTable = async (tableName: string, seats: number) => {
    const name = tableName.trim();
    if (!name) return;
    await apiPost("/api/tables", { name, seats });
    await reload();
  };
  const updateTable = async (t: Table, patch: Partial<Table>) => {
    await apiPatch(`/api/tables/${t.id}`, patch);
    await reload();
  };
  const deleteTable = async (t: Table) => {
    if (!confirm(`Delete ${t.name}?`)) return;
    await apiDelete(`/api/tables/${t.id}`);
    await reload();
  };
  const toggleEnabled = async (t: Table) => {
    await apiPatch(`/api/tables/${t.id}`, { enabled: !t.enabled });
    await reload();
  };
  const doRandomize = async () => {
    const res: any = await apiPost("/api/seating/randomize");
    const keys = (res?.changes ?? []).map((c: any) => `${c.to_table}:${c.to_seat}`).filter(Boolean);
    if (keys.length) setSeatFlash({ nonce: Date.now(), keys });
    await reload();
  };
  const doRebalance = async () => {
    const res: any = await apiPost("/api/seating/rebalance");
    const keys = (res?.changes ?? []).map((c: any) => `${c.to_table}:${c.to_seat}`).filter(Boolean);
    if (keys.length) setSeatFlash({ nonce: Date.now(), keys });
    await reload();
  };
  const doDeseat = async () => {
    await apiPost("/api/seating/deseat");
    await reload();
  };

  const unseatPlayer = async (playerId: string) => {
    const res: any = await apiPost("/api/seating/unseat", { player_id: playerId });
    const k = res?.from?.table_id && res?.from?.seat_num ? `${res.from.table_id}:${res.from.seat_num}` : null;
    if (k) setSeatFlash({ nonce: Date.now(), keys: [k] });
    await reload();
  };
  const moveSeat = async (playerId: string, toTableId: string, toSeatNum: number, mode: "swap" | "move") => {
    const res: any = await apiPost("/api/seating/move", { player_id: playerId, to_table_id: toTableId, to_seat_num: toSeatNum, mode });
    const k1 = res?.to?.table_id && res?.to?.seat_num ? `${res.to.table_id}:${res.to.seat_num}` : null;
    const k2 = res?.from?.table_id && res?.from?.seat_num ? `${res.from.table_id}:${res.from.seat_num}` : null;
    const keys = [k1, k2].filter(Boolean) as string[];
    if (keys.length) setSeatFlash({ nonce: Date.now(), keys });
    await reload();
  };

  // ---- Settings ----
  const setSound = async (cue: "transition" | "half" | "thirty" | "five" | "end", file: string | null) => {
    if (!settings) return;
    const next = { ...settings, sounds: { ...settings.sounds, [cue]: file } };
    await apiPut("/api/settings", next);
    setSoundPreview({ file, playId: Date.now() });
    await reload();
  };

  const saveLevels = async () => {
    if (!settings) return;

    for (const [i, l] of levelsDraft.entries()) {
      if (!Number.isFinite(l.minutes) || l.minutes <= 0) throw new Error(`Level ${i + 1}: minutes must be > 0`);
      if ((l as any).small_blind_cents < 0 || (l as any).big_blind_cents < 0) throw new Error(`Level ${i + 1}: blinds must be >= 0`);
      if ((l as any).big_blind_cents < (l as any).small_blind_cents) throw new Error(`Level ${i + 1}: BB must be >= SB`);
    }

    const next = { ...settings, levels: levelsDraft };
    await apiPut("/api/settings", next);
    setLevelsDirty(false);
    await reload();
  };

  const saveSeating = async (minPlayersPerTable: number) => {
    if (!settings) return;
    const v = Math.max(1, Math.floor(Number(minPlayersPerTable) || 0));
    const next: any = { ...settings, seating: { ...(settings as any).seating, min_players_per_table: v } };
    await apiPut("/api/settings", next);
    await reload();
  };

  const soundToPlayNow = lastSound ?? soundPreview;

  return (
    <div className="container">
      <SoundPlayer file={soundToPlayNow?.file ?? null} playId={soundToPlayNow?.playId} preloadFiles={sounds} />

      <AdminHeader connected={connected} />
      <AdminTabs tab={tab} setTab={setTab} />

      {err ? (
        <div className="card" style={{ marginTop: 10, borderColor: "rgba(255,76,106,0.7)" }}>
          {err}
        </div>
      ) : null}

      {tab === "timer" ? (
        <TimerTab
          settings={settings}
          state={state}
          remainingMs={remainingMs}
          announcements={announcements}
          playersById={playersById}
          tablesById={tablesById}
          onPause={timerPause}
          onResume={timerResume}
          onReset={timerReset}
          onAddTime={timerAdd}
          onGoLevel={timerGo}
        />
      ) : null}

      {tab === "players" ? (
        <PlayersTab
          players={players}
          search={search}
          setSearch={setSearch}
          seatByPlayer={seatByPlayer}
          onAddPlayer={addPlayer}
          onRenamePlayer={renamePlayer}
          onToggleElim={toggleElim}
          onDeletePlayer={deletePlayer}
        />
      ) : null}

      {tab === "levels" ? (
        <LevelsTab
          settings={settings}
          levelsDraft={levelsDraft}
          levelsDirty={levelsDirty}
          setLevelsDraft={setLevelsDraft}
          setLevelsDirty={setLevelsDirty}
          onSaveLevels={saveLevels}
        />
      ) : null}

      {tab === "tables" ? (
        <TablesTab
          tables={tables}
          seatsByTable={seatsByTable}
          players={players}
          playersById={playersById}
          onAddTable={addTable}
          onUpdateTable={updateTable}
          onDeleteTable={deleteTable}
          onToggleEnabled={toggleEnabled}
          onRandomize={doRandomize}
          onRebalance={doRebalance}
          onDeseat={doDeseat}
          onMoveSeat={moveSeat}
          onUnseatPlayer={unseatPlayer}
          seatFlash={seatFlash}
        />
      ) : null}

      {tab === "settings" ? (
        <SettingsTab
          settings={settings}
          sounds={sounds}
          onSetSound={setSound}
          onPreviewSound={(file) => setSoundPreview({ file, playId: Date.now() })}
          onSaveSeating={saveSeating}
        />
      ) : null}
    </div>
  );
}
