import React from "react";
import MoneyDisplay from "./MoneyDisplay";
import { msToClock } from "../utils/time";
import { Level, State } from "../types";
import { Coffee, Martini, Clock, Pause } from "lucide-react";

export default function TimerCard({
  state,
  levels,
  remainingMs,
  bigPic = false
}: {
  state: State;
  levels: Level[];
  remainingMs: number;
  bigPic?: boolean;
}) {
  const rem_time = Math.max(0, remainingMs ?? 0);
  const idx = Math.min(Math.max(state.current_level_index, 0), Math.max(levels.length - 1, 0));
  const cur = levels[idx];
  const next = levels[idx + 1];

  const isBreak = cur?.type === "break";
  const isPaused = !state.running;

  const typeLabel = isBreak ? "Break" : "Level";
  const runBadge = state.running ? "Running" : "Paused";

  const timerClass = bigPic ? "gigantic" : "big";
  const blindClass = bigPic ? "gigantic-sub" : "big-sub";
  const blindSize = bigPic ? 64 : 26;
  const iconSize = bigPic ? 520 : 260;

  // Randomize which background we see
  const breakIcons = [Coffee, Martini, Clock];
  const BreakIcon = breakIcons[idx % 3];

  return (
    <div
      className="card"
      style={{
        ...(cur?.type === "break" ? { backgroundColor: "rgba(255, 235, 130, 0.15)" } : undefined),
        position: "relative",
        overflow: "hidden"
      }}
    >
      {(isBreak || isPaused) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 0
          }}
        >
          {isPaused ? (
            <Pause size={iconSize} strokeWidth={1.5} style={{ opacity: 0.06 }} />
          ) : (
            <BreakIcon size={iconSize} strokeWidth={1.5} style={{ opacity: 0.06 }} />
          )}
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <span className="badge">
              {typeLabel} {idx + 1} / {levels.length}
            </span>{" "}
            <span className="badge">{runBadge}</span>
          </div>
          <div className="muted">Remaining</div>
        </div>

        <div style={{ marginTop: 10 }} className={`timer ${timerClass}`}>
          {msToClock(rem_time)}
        </div>

        <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
          <div className="col">
            <div className="muted" style={{ marginBottom: 6 }}>
              Blinds
            </div>
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 10,
                padding: "10px 14px",
                background: "rgba(255,255,255,0.03)"
              }}
            >
              {cur?.type === "break" ? (
                <div className={`${blindClass}`}>—</div>
              ) : (
                <div className={`${blindClass}`}>
                  <MoneyDisplay cents={cur?.small_blind_cents ?? 0} size={blindSize} />
                  <span className="muted"> / </span>
                  <MoneyDisplay cents={cur?.big_blind_cents ?? 0} size={blindSize} />
                  {cur?.ante_cents ? (
                    <>
                      <span className="muted"> • Ante </span>
                      <MoneyDisplay cents={cur.ante_cents} size={blindSize} muted />
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="col">
            <div className="muted" style={{ marginBottom: 6 }}>
              Next
            </div>
            {next ? (
              next.type === "break" ? (
                <div className={`muted ${blindClass}`}>Break ({next.minutes} min)</div>
              ) : (
                <div className={`muted ${blindClass}`}>
                  <MoneyDisplay cents={next.small_blind_cents} size={blindSize} muted />
                  <span className="muted"> / </span>
                  <MoneyDisplay cents={next.big_blind_cents} size={blindSize} muted />
                  <span className="muted"> • {next.minutes} min</span>
                </div>
              )
            ) : (
              <div className={`${blindClass} muted`}>—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
