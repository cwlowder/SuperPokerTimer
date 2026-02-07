import React, { useCallback, useEffect, useMemo, useState } from "react";
import TimerCard from "../components/TimerCard";
import SoundPlayer from "../components/SoundPlayer";
import Announcements from "../components/Announcements";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../utils/api";
import { Announcement, Player, Seat, Settings, State, Table } from "../types";
import MoneyDisplay from "../components/MoneyDisplay";
import { useEventStream } from "../hooks/useEventStream";
import { useTourneyData } from "../hooks/useTourneyData";

type Tab = "timer" | "players" | "tables" | "settings";

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={"btn" + (active ? " primary" : "")}
      onClick={onClick}
      style={{ padding: "8px 10px" }}
    >
      {children}
    </button>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("timer");

  // ✅ Live data via WebSocket hook
  const { settings, state, lastSoundFile, announcements: liveAnnouncements, connected } = useEventStream();

  // const [sounds, setSounds] = useState<string[]>([]);
  // const [players, setPlayers] = useState<Player[]>([]);
  // const [tables, setTables] = useState<Table[]>([]);
  // const [seats, setSeats] = useState<Seat[]>([]);
  // const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newPlayer, setNewPlayer] = useState("");
  const [newTableName, setNewTableName] = useState("Table 1");
  const [newTableSeats, setNewTableSeats] = useState(9);
  const [soundToPlay, setSoundToPlay] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<string>("");
  
  const {
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
    setAnnouncements,
  } = useTourneyData({ playerSearch: search, auto: true });

  const err = error; // keep your existing rendering

  // When live settings arrive/changes, keep editor updated (but don't fight user typing)
  useEffect(() => {
    if (!settings) return;
    setSettingsDraft((prev) => {
      // If editor is empty, or matches previous settings exactly, update it.
      // Otherwise assume user is editing and leave it alone.
      if (!prev.trim()) return JSON.stringify(settings, null, 2);

      try {
        const parsed = JSON.parse(prev);
        // If draft equals current settings, keep it synced
        if (JSON.stringify(parsed) === JSON.stringify(settings)) {
          return JSON.stringify(settings, null, 2);
        }
      } catch {
        // user is mid-edit; don't overwrite
      }
      return prev;
    });
  }, [settings]);

  // Prefer most recent announcements: live stream first, explain history is fallback
  useEffect(() => {
    if (liveAnnouncements.length > 0) {
      setAnnouncements(liveAnnouncements);
    }
  }, [liveAnnouncements, setAnnouncements]);

  // ---- Timer controls ----
  const timerPause = async () => apiPost("/api/timer/pause");
  const timerResume = async () => apiPost("/api/timer/resume");
  const timerReset = async () => apiPost("/api/timer/reset_level");
  const timerAdd = async (ms: number) => apiPost(`/api/timer/add_time?delta_ms=${ms}`);
  const timerGo = async (idx: number) => apiPost(`/api/timer/go_to_level?level_index=${idx}`);

  // ---- Players ----
  const addPlayer = async () => {
    const name = newPlayer.trim();
    if (!name) return;
    await apiPost("/api/players", { name });
    setNewPlayer("");
    await reload()
  };

  const toggleElim = async (p: Player) => {
    await apiPatch(`/api/players/${p.id}`, { eliminated: !p.eliminated });
    await reload()
  };

  const deletePlayer = async (p: Player) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    await apiDelete(`/api/players/${p.id}`);
    await reload()
  };

  // ---- Tables ----
  const addTable = async () => {
    const name = newTableName.trim();
    if (!name) return;
    await apiPost("/api/tables", { name, seats: newTableSeats });
    await reload()
  };

  const updateTable = async (t: Table, patch: Partial<Table>) => {
    await apiPatch(`/api/tables/${t.id}`, patch);
    await reload()
  };

  const deleteTable = async (t: Table) => {
    if (!confirm(`Delete ${t.name}?`)) return;
    await apiDelete(`/api/tables/${t.id}`);
    await reload()
  };

  const doRandomize = async () => {
    await apiPost("/api/seating/randomize");
    await reload()
  };

  const doRebalance = async () => {
    await apiPost("/api/seating/rebalance");
    await reload()
  };

  // ---- Settings ----
  const setSound = async (cue: "start" | "half" | "thirty" | "end", file: string | null) => {
    if (!settings) return;
    const next = { ...settings, sounds: { ...settings.sounds, [cue]: file } };
    await apiPut("/api/settings", next);
    setSoundToPlay(file); // local preview
    await reload()
  };

  const saveSettingsJson = async () => {
    const parsed = JSON.parse(settingsDraft);
    await apiPut("/api/settings", parsed);
    await reload()
  };

  // const seatsByTable = useMemo(() => {
  //   const m: Record<string, Seat[]> = {};
  //   for (const s of seats) (m[s.table_id] = m[s.table_id] || []).push(s);
  //   for (const k of Object.keys(m)) m[k].sort((a, b) => a.seat_num - b.seat_num);
  //   return m;
  // }, [seats]);

  const levelSelect =
    settings?.levels.map((l, i) => (
      <option key={i} value={i}>
        {i + 1}: {l.type.toUpperCase()} • {l.minutes}m
      </option>
    )) ?? null;

  // For SoundPlayer: if server told us to play a cue, prefer that; otherwise local preview
  const soundFile = lastSoundFile ?? soundToPlay;

  return (
    <div className="container">
      <SoundPlayer file={soundFile} />

      <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Poker Tourney Admin</h1>
        <div className="muted">
          WS: <span className="badge">{connected ? "Connected" : "Disconnected"}</span>{" "}
          <a href="/display" className="badge">
            Big picture
          </a>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <TabButton active={tab === "timer"} onClick={() => setTab("timer")}>
          Timer
        </TabButton>
        <TabButton active={tab === "players"} onClick={() => setTab("players")}>
          Players
        </TabButton>
        <TabButton active={tab === "tables"} onClick={() => setTab("tables")}>
          Tables
        </TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
          Settings
        </TabButton>
        <button className="btn" onClick={() => reload()}>
          Reload
        </button>
      </div>

      {err ? (
        <div className="card" style={{ marginTop: 10, borderColor: "rgba(255,76,106,0.7)" }}>
          {err}
        </div>
      ) : null}

      {tab === "timer" ? (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="col">
            {settings && state ? (
              <TimerCard state={state} levels={settings.levels} />
            ) : (
              <div className="card">Loading…</div>
            )}

            <div className="card" style={{ marginTop: 12 }}>
              <h3>Timer Controls</h3>
              <div className="row">
                <button className="btn primary" onClick={timerResume}>
                  Resume
                </button>
                <button className="btn" onClick={timerPause}>
                  Pause
                </button>
                <button className="btn" onClick={() => timerAdd(60_000)}>
                  +1:00
                </button>
                <button className="btn" onClick={() => timerAdd(-60_000)}>
                  -1:00
                </button>
                <button className="btn" onClick={timerReset}>
                  Reset level
                </button>
              </div>

              <div style={{ marginTop: 10 }} className="grid2">
                <div>
                  <label>Jump to level</label>
                  <select
                    className="input"
                    onChange={(e) => timerGo(Number(e.target.value))}
                    value={state?.current_level_index ?? 0}
                    disabled={!state || !settings}
                  >
                    {levelSelect}
                  </select>
                </div>

                <div>
                  <label>Quick actions</label>
                  <div className="row">
                    <button className="btn" onClick={() => timerAdd(10_000)}>
                      +10s
                    </button>
                    <button className="btn" onClick={() => timerAdd(-10_000)}>
                      -10s
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="muted">
              Phone admin URL: <span className="kbd">{window.location.origin}</span>
            </div>
          </div>

          <div className="col">
            <Announcements items={announcements} playersById={playersById} tablesById={tablesById} />
          </div>
        </div>
      ) : null}

      {tab === "players" ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Players</h3>
          <div className="grid2" style={{ alignItems: "end" }}>
            <div>
              <label>Add player</label>
              <input
                className="input"
                value={newPlayer}
                onChange={(e) => setNewPlayer(e.target.value)}
                placeholder="Name"
              />
            </div>
            <button className="btn primary" onClick={addPlayer}>
              Add
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>Search</label>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
            />
            <div className="muted" style={{ marginTop: 6 }}>
              Search applies on Reload.
            </div>
          </div>

          <hr />

          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th style={{ width: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td
                    style={{
                      opacity: p.eliminated ? 0.6 : 1,
                      textDecoration: p.eliminated ? "line-through" : "none"
                    }}
                  >
                    {p.name}
                  </td>
                  <td>
                    <span className="badge">{p.eliminated ? "Eliminated" : "Active"}</span>
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn" onClick={() => toggleElim(p)}>
                        {p.eliminated ? "Undo" : "Eliminate"}
                      </button>
                      <button className="btn danger" onClick={() => deletePlayer(p)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No players.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "tables" ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Tables & Seating</h3>

          <div className="grid2" style={{ alignItems: "end" }}>
            <div>
              <label>New table name</label>
              <input className="input" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} />
            </div>
            <div>
              <label>Seats</label>
              <input
                className="input"
                type="number"
                value={newTableSeats}
                onChange={(e) => setNewTableSeats(Number(e.target.value))}
                min={2}
                max={12}
              />
            </div>
          </div>

          <div style={{ marginTop: 10 }} className="row">
            <button className="btn primary" onClick={addTable}>
              Add table
            </button>
            <button className="btn" onClick={doRandomize}>
              Randomize
            </button>
            <button className="btn" onClick={doRebalance}>
              Rebalance
            </button>
          </div>

          <hr />

          <div style={{ display: "grid", gap: 12 }}>
            {tables.map((t) => (
              <div
                key={t.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: 12
                }}
              >
                <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>
                      {t.name} <span className="muted">(seats {t.seats})</span>
                    </div>
                    <span className="badge">{t.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div className="row">
                    <button className="btn" onClick={() => apiPatch(`/api/tables/${t.id}`, { enabled: !t.enabled }).then(loadAll)}>
                      {t.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="btn danger" onClick={() => deleteTable(t)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 10 }} className="grid2">
                  <div>
                    <label>Rename</label>
                    <input className="input" defaultValue={t.name} onBlur={(e) => updateTable(t, { name: e.target.value })} />
                  </div>
                  <div>
                    <label>Seats</label>
                    <input
                      className="input"
                      type="number"
                      defaultValue={t.seats}
                      min={2}
                      max={12}
                      onBlur={(e) => updateTable(t, { seats: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Seats
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 8
                    }}
                  >
                    {(seatsByTable[t.id] ?? []).map((s) => {
                      const p = s.player_id ? playersById[s.player_id] : null;
                      return (
                        <div
                          key={`${s.table_id}:${s.seat_num}`}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.10)"
                          }}
                        >
                          <div className="muted" style={{ fontSize: 12 }}>
                            Seat {s.seat_num}
                          </div>
                          <div style={{ fontWeight: 800, opacity: p?.eliminated ? 0.6 : 1 }}>
                            {p ? p.name : <span className="muted">—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {tables.length === 0 ? <div className="muted">No tables yet.</div> : null}
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="col">
            <div className="card">
              <h3>Sounds</h3>
              <div className="muted">Selecting a sound saves immediately and plays a preview.</div>
              <hr />
              {settings ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {(["start", "half", "thirty", "end"] as const).map((cue) => (
                    <div key={cue} className="grid2">
                      <div>
                        <label>{cue.toUpperCase()}</label>
                        <select
                          className="input"
                          value={(settings.sounds as any)[cue] ?? ""}
                          onChange={(e) => setSound(cue, e.target.value === "" ? null : e.target.value)}
                        >
                          <option value="">(None)</option>
                          {sounds.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", alignItems: "end" }}>
                        <button className="btn" onClick={() => setSoundToPlay((settings.sounds as any)[cue] ?? null)}>
                          Preview
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">Loading…</div>
              )}
            </div>
          </div>

          <div className="col">
            <div className="card">
              <h3>Settings JSON (levels / blinds / antes)</h3>
              <div className="muted">
                Edit levels here. Money uses <span className="kbd">cents</span>. Example:{" "}
                <MoneyDisplay cents={123} size={18} muted />.
              </div>
              <hr />
              <textarea
                className="input"
                style={{ minHeight: 420, fontFamily: "ui-monospace, monospace" }}
                value={settingsDraft}
                onChange={(e) => setSettingsDraft(e.target.value)}
              />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={saveSettingsJson} disabled={!settingsDraft.trim()}>
                  Save settings
                </button>
                <button className="btn" onClick={() => settings && setSettingsDraft(JSON.stringify(settings, null, 2))} disabled={!settings}>
                  Reset editor
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
