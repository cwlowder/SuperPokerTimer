import React, { useState } from "react";
import { GripVertical, MoveUp, MoveDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import MoneyDisplay from "../MoneyDisplay";
import { Denomination, Level, Settings } from "../../types";

function LevelsCard({
  settings,
  levelsDraft,
  levelsDirty,
  setLevelsDirty,
  setLevelsDraft,
  onSave,
  currencySymbol = "$",
  denomination = "cents"
}: {
  settings: Settings | null;
  levelsDraft: Level[];
  levelsDirty: boolean;
  setLevelsDirty: (b: boolean) => void;
  setLevelsDraft: React.Dispatch<React.SetStateAction<Level[]>>;
  onSave: () => Promise<void>;
  currencySymbol?: string;
  denomination?: Denomination;
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
        small_blind_cents: type === "break" ? 0 : 50,
        big_blind_cents: type === "break" ? 0 : 100,
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

  const shouldCancelRowDrag = (target: EventTarget | null) => {
    if (!target || !(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        "button, a, input, select, textarea, [contenteditable='true'], [role='button'], [data-no-drag='true']"
      )
    );
  };

  const totalMinutes = levelsDraft.reduce((sum, level) => sum + Math.max(0, Number(level.minutes) || 0), 0);
  const breakMinutes = levelsDraft.reduce(
    (sum, level) => sum + (level.type !== "regular" ? Math.max(0, Number(level.minutes) || 0) : 0),
    0
  );

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours > 0 && remainder > 0) {
      return t("levels.summary.durationHoursMinutes", { hours, minutes: remainder });
    }

    if (hours > 0) {
      return t("levels.summary.durationHours", { hours });
    }

    return t("levels.summary.durationMinutes", { minutes: remainder });
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
              const insertionShadow =
                !isNoop && dragOver?.idx === idx
                  ? dragOver.where === "above"
                    ? "inset 0 2px 0 rgba(120,200,255,0.75)"
                    : "inset 0 -2px 0 rgba(120,200,255,0.75)"
                  : null;
              const breakAccentShadow = isBreak ? "inset 4px 0 0 rgba(255, 200, 80, 0.7)" : null;
              const rowShadow = [insertionShadow, breakAccentShadow].filter(Boolean).join(", ") || "none";

              return (
                <tr
                  key={idx}
                  draggable
                  onPointerDownCapture={(e) => {
                    // When the row is draggable, browsers can prioritize drag gestures over
                    // text selection inside form controls (eg double-click select in inputs).
                    // Temporarily disable row dragging when the pointer starts on an
                    // interactive element.
                    if (shouldCancelRowDrag(e.target)) {
                      e.currentTarget.draggable = false;
                    } else {
                      e.currentTarget.draggable = true;
                    }
                  }}
                  onPointerUpCapture={(e) => {
                    e.currentTarget.draggable = true;
                  }}
                  onDragStart={(e) => {
                    if (shouldCancelRowDrag(e.target)) {
                      e.preventDefault();
                      return;
                    }

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
                    background: isNoop ? "rgba(120,200,255,0.08)" : isBreak ? "rgba(255, 235, 130, 0.05)" : undefined,

                    // insertion indicator (line between rows)
                    boxShadow: rowShadow
                  }}
                >
                  <td>
                    <span
                      title={t("settings.dragReorderLevels")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "grab",
                        userSelect: "none"
                      }}
                    >
                      <GripVertical
                        size={20}
                        style={{
                          opacity: 0.28,
                          display: "block"
                        }}
                      />
                    </span>
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
                      disabled={isBreak}
                      currencySymbol={currencySymbol}
                      denomination={denomination}
                      onChange={(cents) => updateLevel(idx, { small_blind_cents: cents })}
                    />
                  </td>

                  <td>
                    <MoneyDisplay
                      cents={l.big_blind_cents ?? 0}
                      size={20}
                      editable
                      disabled={isBreak}
                      currencySymbol={currencySymbol}
                      denomination={denomination}
                      onChange={(cents) => updateLevel(idx, { big_blind_cents: cents })}
                    />
                  </td>

                  <td>
                    <MoneyDisplay
                      cents={l.ante_cents ?? 0}
                      size={20}
                      editable
                      disabled={isBreak}
                      currencySymbol={currencySymbol}
                      denomination={denomination}
                      onChange={(cents) => updateLevel(idx, { ante_cents: cents })}
                    />
                  </td>

                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <button className="btn" onClick={() => moveLevel(idx, idx - 1)} disabled={idx === 0} title={t("levels.actions.moveUp")}>
                        <MoveUp size={12} />
                      </button>
                      <button
                        className="btn"
                        onClick={() => moveLevel(idx, idx + 1)}
                        disabled={idx === levelsDraft.length - 1}
                        title={t("levels.actions.moveDown")}
                      >
                        <MoveDown size={12} />
                      </button>
                      <button className="btn danger" onClick={() => removeLevel(idx)} title={t("levels.actions.remove")}>
                        <X size={12} />
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

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <div className="muted" style={{ padding: "8px 10px", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8 }}>
          {t("levels.summary.totalDuration")}: <strong style={{ opacity: 1 }}>{formatDuration(totalMinutes)}</strong>
        </div>
        <div className="muted" style={{ padding: "8px 10px", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8 }}>
          {t("levels.summary.breakDuration")}: <strong style={{ opacity: 1 }}>{formatDuration(breakMinutes)}</strong>
        </div>
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
  onSaveLevels,
  currencySymbol = "$",
  denomination = "cents"
}: {
  settings: Settings | null;
  levelsDraft: Level[];
  levelsDirty: boolean;
  setLevelsDraft: React.Dispatch<React.SetStateAction<Level[]>>;
  setLevelsDirty: (b: boolean) => void;
  onSaveLevels: () => Promise<void>;
  currencySymbol?: string;
  denomination?: Denomination;
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
        currencySymbol={currencySymbol}
        denomination={denomination}
      />
    </div>
  );
}
