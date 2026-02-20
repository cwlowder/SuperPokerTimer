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

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("timer");

  const { settings, state, remainingMs, lastSound, announcements: liveAnnouncements, connected, timerStatus } = useEventStream();

  const [search, setSearch] = useState("");
  const [newTableName, setNewTableName] = useState("Table 1");
  const [newTableSeats, setNewTableSeats] = useState(9);
  const [soundPreview, setSoundPreview] = useState<{ file: string | null; playId: number } | null>(null);
  const [levelsDraft, setLevelsDraft] = useState<Level[]>([]);
  const [levelsDirty, setLevelsDirty] = useState(false);

  useEffect(() => {
    if (!settings) return;
    if (!levelsDirty) setLevelsDraft(settings.levels ?? []);
  }, [settings, levelsDirty]);

  const { sounds, players, tables, announcements, playersById, tablesById, seatsByTable, error, reload, setAnnouncements } =
    useTourneyData({ playerSearch: search, auto: true });

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
  const deletePlayer = async (p: Player) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    await apiDelete(`/api/players/${p.id}`);
    await reload();
  };

  // ---- Tables ----
  const addTable = async () => {
    const name = newTableName.trim();
    if (!name) return;
    await apiPost("/api/tables", { name, seats: newTableSeats });
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
    await apiPost("/api/seating/randomize");
    await reload();
  };
  const doRebalance = async () => {
    await apiPost("/api/seating/rebalance");
    await reload();
  };
  const doDeseat = async () => {
    await apiPost("/api/seating/deseat");
    await reload();
  };
  const moveSeat = async (playerId: string, toTableId: string, toSeatNum: number) => {
    await apiPost("/api/seating/move", { player_id: playerId, to_table_id: toTableId, to_seat_num: toSeatNum, mode: "swap" });
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
          onAddPlayer={addPlayer}
          onToggleElim={toggleElim}
          onDeletePlayer={deletePlayer}
        />
      ) : null}

      {tab === "tables" ? (
        <TablesTab
          tables={tables}
          seatsByTable={seatsByTable}
          playersById={playersById}
          newTableName={newTableName}
          setNewTableName={setNewTableName}
          newTableSeats={newTableSeats}
          setNewTableSeats={setNewTableSeats}
          onAddTable={addTable}
          onUpdateTable={updateTable}
          onDeleteTable={deleteTable}
          onToggleEnabled={toggleEnabled}
          onRandomize={doRandomize}
          onRebalance={doRebalance}
          onDeseat={doDeseat}
          onMoveSeat={moveSeat}
        />
      ) : null}

      {tab === "settings" ? (
        <SettingsTab
          settings={settings}
          sounds={sounds}
          levelsDraft={levelsDraft}
          levelsDirty={levelsDirty}
          setLevelsDraft={setLevelsDraft}
          setLevelsDirty={setLevelsDirty}
          onSetSound={setSound}
          onPreviewSound={(file) => setSoundPreview({ file, playId: Date.now() })}
          onSaveLevels={saveLevels}
        />
      ) : null}
    </div>
  );
}
