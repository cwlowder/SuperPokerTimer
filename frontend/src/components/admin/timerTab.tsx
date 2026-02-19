import { Announcement, Player, Settings, Table } from "../../types";
import Announcements from "../Announcements";
import TimerCard from "../TimerCard";
import { RotateCw, RotateCcw, FastForward, Rewind, TimerReset, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  const levelSelect =
    settings?.levels.map((l, i) => {
      const typeLabel = t(`levels.${l.type}`);
      return (
        <option key={i} value={i}>
          {i + 1}: {typeLabel} • {l.minutes}m
        </option>
      );
    }) ?? null;

  return (
    <div className="row" style={{ marginTop: 12 }}>
      <div className="col">
        {settings && state ? (
          <TimerCard state={state} levels={settings.levels} remainingMs={remainingMs ?? 0} />
        ) : (
          <div className="card">{t("common.loading")}</div>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <h3>{t("timer.controlsTitle")}</h3>
          <div className="row">
            {state && !state.running ? (
              <button className="btn primary" onClick={onResume} title={t("controls.resume")}>
                <Play size={12} />
              </button>
            ) : (
              <button className="btn" onClick={onPause} title={t("controls.pause")}>
                <Pause size={12} />
              </button>
            )}
            <button className="btn" onClick={() => onAddTime(60_000)} title={t("timer.addOneMinute")}>
              <Rewind size={12} />
            </button>
            <button className="btn" onClick={() => onAddTime(10_000)} title={t("timer.addTenSeconds")}>
              <RotateCcw size={12} />
            </button>
            <button className="btn" onClick={() => onAddTime(-10_000)} title={t("timer.removeTenSeconds")}>
              <RotateCw size={12} />
            </button>
            <button className="btn" onClick={() => onAddTime(-60_000)} title={t("timer.removeOneMinute")}>
              <FastForward size={12} />
            </button>
            <button className="btn" onClick={onReset} title={t("controls.reset")}>
              <TimerReset size={12} />
            </button>
          </div>

          <div style={{ marginTop: 10 }} className="grid2">
            <div>
              <label>{t("timer.jumpToLevel")}</label>
              <select
                className="input"
                onChange={(e) => onGoLevel(Number(e.target.value))}
                value={state?.current_level_index ?? 0}
                disabled={!state || !settings}
              >
                {levelSelect}
              </select>
            </div>
            {/*
            <div>
              <label>Quick actions</label>
              <div className="row">
              </div>
            </div>*/}
          </div>
        </div>

        <div style={{ marginTop: 12 }} className="muted">
          {t("timer.adminUrlText")}: <span className="kbd">{window.location.origin}</span>
        </div>
      </div>

      <div className="col">
        <Announcements items={announcements} playersById={playersById} tablesById={tablesById} />
      </div>
    </div>
  );
}
