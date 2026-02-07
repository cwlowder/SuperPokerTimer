import React, { useCallback, useEffect, useMemo, useState } from "react";
import TimerCard from "../components/TimerCard";
import SoundPlayer from "../components/SoundPlayer";
import Announcements from "../components/Announcements";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../utils/api";
import { Announcement, Player, Seat, Settings, Level, State, Table } from "../types";
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
  const { settings, state, lastSound, announcements: liveAnnouncements, connected } = useEventStream();

  const [search, setSearch] = useState("");
  const [newPlayer, setNewPlayer] = useState("");
  const [newTableName, setNewTableName] = useState("Table 1");
  const [newTableSeats, setNewTableSeats] = useState(9);
  const [soundPreview, setSoundPreview] = useState<{ file: string | null; playId: number } | null>(null);
  const [levelsDraft, setLevelsDraft] = useState<Level[]>([]);
  const [levelsDirty, setLevelsDirty] = useState(false);

  useEffect(() => {
    if (!settings) return;
    // only refresh draft when not actively editing
    if (!levelsDirty) setLevelsDraft(settings.levels ?? []);
  }, [settings, levelsDirty]);


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

  const doDeseat = async () => {
    await apiPost("/api/seating/deseat");
    await reload()
  };

  // ---- Settings ----
  const setSound = async (cue: "start" | "half" | "thirty" | "five" | "end", file: string | null) => {
    if (!settings) return;
    const next = { ...settings, sounds: { ...settings.sounds, [cue]: file } };
    await apiPut("/api/settings", next);
    setSoundPreview({file: file, playId: Date.now()}); // local preview
    await reload()
  };

  const updateLevel = (idx: number, patch: Partial<(Settings["levels"][number])>) => {
    setLevelsDirty(true);
    setLevelsDraft((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLevel = (type: "regular" | "break") => {
    setLevelsDirty(true);
    setLevelsDraft((prev) => [
      ...prev,
      {
        type,
        minutes: type === "break" ? 10 : 15,
        small_blind_cents: 50,
        big_blind_cents: 100,
        ante_cents: 0,
      } as any
    ]);
  };

  const removeLevel = (idx: number) => {
    setLevelsDirty(true);
    setLevelsDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveLevel = (idx: number, dir: -1 | 1) => {
    setLevelsDirty(true);
    setLevelsDraft((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[j];
      next[j] = tmp;
      return next;
    });
  };

  const saveLevels = async () => {
    if (!settings) return;
    // Basic validation: minutes > 0, blinds non-negative
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
  const soundToPlayNow = lastSound ?? soundPreview;

  return (
    <div className="container">
      <SoundPlayer file={soundToPlayNow?.file ?? null} playId={soundToPlayNow?.playId} />

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
            <button className="btn" onClick={doDeseat}>
              Deseat
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
                    <button className="btn" onClick={() => apiPatch(`/api/tables/${t.id}`, { enabled: !t.enabled }).then(reload)}>
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
        <div className="row" style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div className="card">
            <h3>Sounds</h3>
            <div className="muted">Selecting a sound saves immediately and plays a preview.</div>
            <hr />
            {settings ? (
              <div style={{ display: "grid", gap: 10 }}>
                {(["start", "half", "thirty", "five", "end"] as const).map((cue) => (
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
                      <button
                        className="btn"
                        onClick={() => {
                          const file = (settings.sounds as any)[cue] ?? null;
                          if (!file) return;
                          console.log("file", file);
                          setSoundPreview({ file, playId: Date.now() });
                        }}
                      >
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
          <div className="card">
            <h3>Levels</h3>
            <div className="muted">
              Edit tournament structure here (no JSON). Money is in <span className="kbd">cents</span> (e.g. <MoneyDisplay cents={123} size={18} muted />).
            </div>
            <hr />

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => addLevel("regular")}>+ Regular level</button>
              <button className="btn" onClick={() => addLevel("break")}>+ Break</button>
              <button className="btn primary" onClick={saveLevels} disabled={!settings || !levelsDirty}>
                Save levels
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (!settings) return;
                  setLevelsDraft(settings.levels ?? []);
                  setLevelsDirty(false);
                }}
                disabled={!settings || !levelsDirty}
              >
                Discard changes
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th>
                    <th style={{ width: 120 }}>Type</th>
                    <th style={{ width: 120 }}>Minutes</th>
                    <th style={{ width: 140 }}>SB</th>
                    <th style={{ width: 140 }}>BB</th>
                    <th style={{ width: 140 }}>Ante</th>
                    <th style={{ width: 180 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {levelsDraft.map((l: any, idx: number) => (
                    <tr
                      key={idx}
                      style={l.type === "break" ? { backgroundColor: "rgba(255, 235, 130, 0.15)" } : undefined}
                    >
                      <td className="muted">{idx + 1}</td>

                      <td>
                        <select
                          className="input"
                          value={l.type}
                          onChange={(e) => updateLevel(idx, { type: e.target.value })}
                        >
                          <option value="regular">Regular</option>
                          <option value="break">Break</option>
                        </select>
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          value={l.minutes}
                          onChange={(e) => updateLevel(idx, { minutes: Number(e.target.value) })}
                        />
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={25}
                          value={l.small_blind_cents ?? 0}
                          onChange={(e) => updateLevel(idx, { small_blind_cents: Number(e.target.value) })}
                          disabled={l.type === "break"}
                        />
                        <div className="muted" style={{ marginTop: 4 }}>
                          <MoneyDisplay cents={l.small_blind_cents ?? 0} muted />
                        </div>
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={25}
                          value={l.big_blind_cents ?? 0}
                          onChange={(e) => updateLevel(idx, { big_blind_cents: Number(e.target.value) })}
                          disabled={l.type === "break"}
                        />
                        <div className="muted" style={{ marginTop: 4 }}>
                          <MoneyDisplay cents={l.big_blind_cents ?? 0} muted />
                        </div>
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={25}
                          value={l.ante_cents ?? 0}
                          onChange={(e) => updateLevel(idx, { ante_cents: Number(e.target.value) })}
                          disabled={l.type === "break"}
                        />
                        <div className="muted" style={{ marginTop: 4 }}>
                          <MoneyDisplay cents={l.ante_cents ?? 0} muted />
                        </div>
                      </td>

                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          <button className="btn" onClick={() => moveLevel(idx, -1)} disabled={idx === 0}>↑</button>
                          <button className="btn" onClick={() => moveLevel(idx, 1)} disabled={idx === levelsDraft.length - 1}>↓</button>
                          <button className="btn danger" onClick={() => removeLevel(idx)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {levelsDraft.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">No levels yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Tip: Break levels ignore blinds/antes.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
