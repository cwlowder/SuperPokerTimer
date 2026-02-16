import { Announcement, Player, Settings, Level, Table } from "../../types";
import Announcements from "../Announcements";
import TimerCard from "../TimerCard";
import { Pause, Play } from "lucide-react";

export function TimerTab({
  settings,
  state,
  remainingMs,
  announcements,
  playersById,
  tablesById,
  onPause,
  onResume,
  onReset,
  onAddTime,
  onGoLevel
}: {
  settings: Settings | null;
  state: any | null;
  remainingMs: number | null;
  announcements: Announcement[];
  playersById: Record<string, Player>;
  tablesById: Record<string, Table>;
  onPause: () => Promise<any>;
  onResume: () => Promise<any>;
  onReset: () => Promise<any>;
  onAddTime: (ms: number) => Promise<any>;
  onGoLevel: (idx: number) => Promise<any>;
}) {
  const levelSelect =
    settings?.levels.map((l, i) => (
      <option key={i} value={i}>
        {i + 1}: {l.type.toUpperCase()} • {l.minutes}m
      </option>
    )) ?? null;

  return (
    <div className="row" style={{ marginTop: 12 }}>
      <div className="col">
        {settings && state ? (
          <TimerCard state={state} levels={settings.levels} remainingMs={remainingMs ?? 0} />
        ) : (
          <div className="card">Loading…</div>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <h3>Timer Controls</h3>
          <div className="row">
            {state && !state.running ? (
              <button className="btn primary" onClick={onResume}>
                <Play size={12} />
              </button>
            ) : (
              <button className="btn" onClick={onPause}>
                <Pause size={12} />
              </button>
            )}
            <button className="btn" onClick={() => onAddTime(60_000)}>
              +1:00
            </button>
            <button className="btn" onClick={() => onAddTime(-60_000)}>
              -1:00
            </button>
            <button className="btn" onClick={onReset}>
              Reset level
            </button>
          </div>

          <div style={{ marginTop: 10 }} className="grid2">
            <div>
              <label>Jump to level</label>
              <select
                className="input"
                onChange={(e) => onGoLevel(Number(e.target.value))}
                value={state?.current_level_index ?? 0}
                disabled={!state || !settings}
              >
                {levelSelect}
              </select>
            </div>

            <div>
              <label>Quick actions</label>
              <div className="row">
                <button className="btn" onClick={() => onAddTime(10_000)}>
                  +10s
                </button>
                <button className="btn" onClick={() => onAddTime(-10_000)}>
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
  );
}
