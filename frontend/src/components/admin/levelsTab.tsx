import React, { useState } from "react";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import MoneyDisplay from "../MoneyDisplay";
import { Level, Settings } from "../../types";

function LevelsCard({
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
  const { t } = useTranslation();

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
      <h3>{t("levels.title")}</h3>
      <div className="muted">{t("levels.helpText")}</div>
      <hr />

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => addLevel("regular")}>
          {t("levels.actions.addRegular")}
        </button>
        <button className="btn" onClick={() => addLevel("break")}>
          {t("levels.actions.addBreak")}
        </button>
        <button className="btn primary" onClick={onSave} disabled={!settings || !levelsDirty}>
          {t("levels.actions.save")}
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
          {t("levels.actions.discard")}
        </button>
      </div>

      <div style={{ fontSize: 20, marginTop: 12, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 44 }} />
              <th style={{ width: 60 }}>{t("levels.columns.number")}</th>
              <th style={{ width: 120 }}>{t("levels.columns.type")}</th>
              <th style={{ width: 120 }}>{t("levels.columns.minutes")}</th>
              <th style={{ width: 140 }}>{t("levels.columns.sb")}</th>
              <th style={{ width: 140 }}>{t("levels.columns.bb")}</th>
              <th style={{ width: 140 }}>{t("levels.columns.ante")}</th>
              <th style={{ width: 180 }}>{t("levels.columns.actions")}</th>
            </tr>
          </thead>

          <tbody>
            {levelsDraft.map((l: Level, idx: number) => {
              const isDragging = dragIdx === idx;

              const isNoop =
                isDragging &&
                (dragOver?.idx === dragIdx ||
                  (dragOver?.where === "above" && dragOver.idx - 1 === dragIdx) ||
                  (dragOver?.where === "below" && dragOver.idx + 1 === dragIdx));

              const isBreak = l.type === "break";

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
                  onDragLeave={() => setDragOver((cur) => (cur && cur.idx === idx ? null : cur))}
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
                    background: isNoop ? "rgba(120,200,255,0.08)" : isBreak ? "rgba(255, 235, 130, 0.15)" : undefined,

                    // insertion indicator (line between rows)
                    boxShadow:
                      !isNoop && dragOver?.idx === idx
                        ? dragOver.where === "above"
                          ? "inset 0 2px 0 rgba(120,200,255,0.75)"
                          : "inset 0 -2px 0 rgba(120,200,255,0.75)"
                        : "none"
                  }}
                  title={t("settings.dragReorderLevels")}
                >
                  <td>
                    <GripVertical
                      size={20}
                      style={{
                        opacity: 0.28,
                        display: "block"
                      }}
                    />
                  </td>

                  <td className="muted">{idx + 1}</td>

                  <td>
                    <select
                      className="input"
                      style={{ fontSize: 20 }}
                      value={l.type}
                      onChange={(e) => updateLevel(idx, { type: e.target.value as Level["type"] })}
                    >
                      <option value="regular">{t("levels.regular")}</option>
                      <option value="break">{t("levels.break")}</option>
                    </select>
                  </td>

                  <td>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={l.minutes}
                      style={{ fontSize: 20 }}
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
                      <button className="btn" onClick={() => moveLevel(idx, idx - 1)} disabled={idx === 0} title={t("levels.actions.moveUp")}>
                        Up
                      </button>
                      <button
                        className="btn"
                        onClick={() => moveLevel(idx, idx + 1)}
                        disabled={idx === levelsDraft.length - 1}
                        title={t("levels.actions.moveDown")}
                      >
                        Down
                      </button>
                      <button className="btn danger" onClick={() => removeLevel(idx)}>
                        {t("levels.actions.remove")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {levelsDraft.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  {t("levels.noLevels")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        {t("levels.breakTip")}
      </div>
    </div>
  );
}

export function LevelsTab({
  settings,
  levelsDraft,
  levelsDirty,
  setLevelsDraft,
  setLevelsDirty,
  onSaveLevels
}: {
  settings: Settings | null;
  levelsDraft: Level[];
  levelsDirty: boolean;
  setLevelsDraft: React.Dispatch<React.SetStateAction<Level[]>>;
  setLevelsDirty: (b: boolean) => void;
  onSaveLevels: () => Promise<void>;
}) {
  return (
    <div style={{ marginTop: 12 }}>
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
