import { Level, Settings } from "../../types";
import MoneyDisplay from "../MoneyDisplay";

export function SoundsCard({
  settings,
  sounds,
  onSetSound,
  onPreview
}: {
  settings: Settings | null;
  sounds: string[];
  onSetSound: (cue: "transition" | "half" | "thirty" | "five" | "end", file: string | null) => Promise<void>;
  onPreview: (file: string) => void;
}) {
  return (
    <div className="card">
      <h3>Sounds</h3>
      <div className="muted">Selecting a sound saves immediately and plays a preview.</div>
      <hr />
      {settings ? (
        <div style={{ display: "grid", gap: 10 }}>
          {(["transition", "half", "thirty", "five", "end"] as const).map((cue) => (
            <div key={cue} className="grid2">
              <div>
                <label>{cue.toUpperCase()}</label>
                <select
                  className="input"
                  value={(settings.sounds as any)[cue] ?? ""}
                  onChange={(e) => onSetSound(cue, e.target.value === "" ? null : e.target.value)}
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
                    onPreview(file);
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
  );
}

export function LevelsCard({
  settings,
  levelsDraft,
  levelsDirty,
  setLevelsDirty,
  setLevelsDraft,
  onSave
}: {
  settings: Settings | null;
  levelsDraft: Level[];
  levelsDirty: boolean;
  setLevelsDirty: (b: boolean) => void;
  setLevelsDraft: React.Dispatch<React.SetStateAction<Level[]>>;
  onSave: () => Promise<void>;
}) {
  const updateLevel = (idx: number, patch: Partial<Settings["levels"][number]>) => {
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
        ante_cents: 0
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

  return (
    <div className="card">
      <h3>Levels</h3>
      <div className="muted">
        Edit tournament structure here. Money is in <span className="kbd">cents</span> (e.g.{" "}
        <MoneyDisplay cents={123} size={18} muted />
        ).
      </div>
      <hr />

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => addLevel("regular")}>
          + Regular level
        </button>
        <button className="btn" onClick={() => addLevel("break")}>
          + Break
        </button>
        <button className="btn primary" onClick={onSave} disabled={!settings || !levelsDirty}>
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
                  <select className="input" value={l.type} onChange={(e) => updateLevel(idx, { type: e.target.value })}>
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
                    <button className="btn" onClick={() => moveLevel(idx, -1)} disabled={idx === 0}>
                      ↑
                    </button>
                    <button className="btn" onClick={() => moveLevel(idx, 1)} disabled={idx === levelsDraft.length - 1}>
                      ↓
                    </button>
                    <button className="btn danger" onClick={() => removeLevel(idx)}>
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {levelsDraft.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No levels yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        Tip: Break levels ignore blinds/antes.
      </div>
    </div>
  );
}

export function SettingsTab({
  settings,
  sounds,
  levelsDraft,
  levelsDirty,
  setLevelsDraft,
  setLevelsDirty,
  onSetSound,
  onPreviewSound,
  onSaveLevels
}: {
  settings: Settings | null;
  sounds: string[];
  levelsDraft: Level[];
  levelsDirty: boolean;
  setLevelsDraft: React.Dispatch<React.SetStateAction<Level[]>>;
  setLevelsDirty: (b: boolean) => void;
  onSetSound: (cue: "transition" | "half" | "thirty" | "five" | "end", file: string | null) => Promise<void>;
  onPreviewSound: (file: string) => void;
  onSaveLevels: () => Promise<void>;
}) {
  return (
    <div className="row" style={{ marginTop: 12, display: "grid", gap: 12 }}>
      <SoundsCard settings={settings} sounds={sounds} onSetSound={onSetSound} onPreview={onPreviewSound} />
      <LevelsCard
        settings={settings}
        levelsDraft={levelsDraft}
        levelsDirty={levelsDirty}
        setLevelsDraft={setLevelsDraft}
        setLevelsDirty={setLevelsDirty}
        onSave={onSaveLevels}
      />
    </div>
  );
}