import { Level, Settings } from "../../types";
import MoneyDisplay from "../MoneyDisplay";
import { GripVertical } from "lucide-react";
import React, { useState } from "react";

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
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ idx: number; where: "above" | "below" } | null>(null);

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

  const moveLevel = (from: number, to: number) => {
    setLevelsDirty(true);
    setLevelsDraft((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
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

      <div style={{ fontSize: 20, marginTop: 12, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 44 }} />
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
            {levelsDraft.map((l: Level, idx: number) => {
              const isDragging = dragIdx === idx;

              const isNoop = isDragging && ( 
                 dragOver?.idx === dragIdx
                 || dragOver?.where === "above" && dragOver.idx - 1 === dragIdx
                 || dragOver?.where === "below" && dragOver.idx + 1 === dragIdx);

              const isBreak = l.type === "break";
              console.log("isBreak", isBreak, l.type);

              return (
                <tr
                  key={idx}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(idx);
                    e.dataTransfer.setData("text/level-idx", String(idx));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragOver(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const where: "above" | "below" = y < rect.height / 2 ? "above" : "below";
                    setDragOver({ idx, where });
                  }}
                  onDragLeave={() =>
                    setDragOver((cur) => (cur && cur.idx === idx ? null : cur))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromStr = e.dataTransfer.getData("text/level-idx");
                    const from = fromStr ? Number(fromStr) : dragIdx;
                    if (from == null || Number.isNaN(from)) return;

                    const over = dragOver;
                    setDragIdx(null);
                    setDragOver(null);
                    if (!over) return;

                    // "between rows" insertion index
                    let to = over.idx + (over.where === "below" ? 1 : 0);

                    // account for the removal shift when moving downwards
                    if (from < to) to -= 1;

                    if (to === from) return;
                    moveLevel(from, to);
                  }}
                  style={{
                    opacity: dragIdx === idx ? 0.55 : 1,
                    transition: "opacity 120ms ease",
                    cursor: "grab",

                    outline: isNoop ? "2px solid rgba(120,200,255,0.6)" : "none",
                    background: isNoop ? "rgba(120,200,255,0.08)" : (isBreak ? "rgba(255, 235, 130, 0.15)": undefined),

                    // insertion indicator (line between rows)
                    boxShadow:
                      !isNoop && dragOver?.idx === idx
                        ? dragOver.where === "above"
                          ? "inset 0 2px 0 rgba(120,200,255,0.75)"
                          : "inset 0 -2px 0 rgba(120,200,255,0.75)"
                        : "none"
                  }}
                  title="Drag to reorder levels"
                >
                  <td>
                    <GripVertical
                      size={20}
                      style={{
                        opacity: 0.28, // more muted
                        display: "block"
                      }}
                    />
                  </td>

                  <td className="muted">{idx + 1}</td>

                  <td>
                    <select className="input" style={{fontSize: 20}} value={l.type} onChange={(e) => updateLevel(idx, { type: e.target.value })}>
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
                      style={{fontSize: 20}}
                      onChange={(e) => updateLevel(idx, { minutes: Number(e.target.value) })}
                    />
                  </td>

                  <td>
                    <MoneyDisplay
                      cents={l.small_blind_cents ?? 0}
                      size={20}
                      editable
                      onChange={(cents) => updateLevel(idx, { small_blind_cents: cents })}
                    />
                  </td>

                  <td>
                    <MoneyDisplay
                      cents={l.big_blind_cents ?? 0}
                      size={20}
                      editable
                      onChange={(cents) => updateLevel(idx, { big_blind_cents: cents })}
                    />
                  </td>

                  <td>
                    <MoneyDisplay
                      cents={l.ante_cents ?? 0}
                      size={20}
                      editable
                      onChange={(cents) => updateLevel(idx, { ante_cents: cents })}
                    />
                  </td>

                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <button className="btn" onClick={() => moveLevel(idx, idx - 1)} disabled={idx === 0}>
                        ↑
                      </button>
                      <button className="btn" onClick={() => moveLevel(idx, idx + 1)} disabled={idx === levelsDraft.length - 1}>
                        ↓
                      </button>
                      <button className="btn danger" onClick={() => removeLevel(idx)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {levelsDraft.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
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