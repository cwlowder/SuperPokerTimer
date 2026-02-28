import { Settings } from "../../types";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { noVolume, halfVolume, fullVolume } from "../../hooks/useLocalSettings";
import { useLocalSettingsCtx } from "../../context/LocalSettingsContext";

export function SeatingCard({
  settings,
  onSave
}: {
  settings: Settings | null;
  onSave: (minPlayersPerTable: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const cur = (settings as any)?.seating?.min_players_per_table ?? 4;
  const [draft, setDraft] = useState<number>(cur);
  const dirty = draft !== cur;

  React.useEffect(() => {
    setDraft(cur);
  }, [cur]);

  return (
    <div className="card">
      <h3>{t("seating.sectionTitle")}</h3>
      <div className="muted">{t("seating.helpText")}</div>
      <hr />

      {settings ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="grid2">
            <div>
              <label>{t("seating.minPlayersPerTable")}</label>
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={draft}
                onChange={(e) => setDraft(Number(e.target.value))}
              />
            </div>
            <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
              <button
                className="btn primary"
                disabled={!dirty}
                onClick={async () => {
                  await onSave(draft);
                }}
              >
                {t("seating.save")}
              </button>
              <button
                className="btn"
                disabled={!dirty}
                onClick={() => setDraft(cur)}
              >
                {t("levels.actions.discard")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="muted">{t("common.loading")}</div>
      )}
    </div>
  );
}

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
  const { t } = useTranslation();
  const { settings: localSettings, setSettings } = useLocalSettingsCtx();

  const volumeValue =
    localSettings.volume === noVolume ? "off" : localSettings.volume === halfVolume ? "low" : "full";

  return (
    <div className="card">
      <h3>{t("sound.sectionTitle")}</h3>
      <div className="muted">{t("sound.volumeText")}</div>
      <hr/>
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        {/* 3-position "slider" using a range input */}
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={volumeValue === "off" ? 0 : volumeValue === "low" ? 1 : 2}
          onChange={(e) => {
            const idx = Number(e.target.value);
            const v = idx === 0 ? noVolume : idx === 1 ? halfVolume : fullVolume;
            setSettings((prev) => ({ ...prev, volume: v }));
          }}
        />

        <div className="muted" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{t("sound.volumeOff")}</span>
          <span>{t("sound.volumeLow")}</span>
          <span>{t("sound.volumeFull")}</span>
        </div>
      </div>
      <br/>
      <div className="muted">{t("sound.helpText")}</div>
      <hr />
      {settings ? (
        <div style={{ display: "grid", gap: 10 }}>
          {(["transition", "half", "thirty", "five", "end"] as const).map((cue) => (
            <div key={cue} className="grid2">
              <div>
                <label>{t(`sound.${cue}`)}</label>
                <select
                  className="input"
                  value={(settings.sounds as any)[cue] ?? ""}
                  onChange={(e) => onSetSound(cue, e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">{t("sound.none")}</option>
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
                  {t("sound.preview")}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">{t("common.loading")}</div>
      )}
    </div>
  );
}


export function SettingsTab({
  settings,
  sounds,
  onSetSound,
  onPreviewSound,
  onSaveSeating
}: {
  settings: Settings | null;
  sounds: string[];
  onSetSound: (cue: "transition" | "half" | "thirty" | "five" | "end", file: string | null) => Promise<void>;
  onPreviewSound: (file: string) => void;
  onSaveSeating: (minPlayersPerTable: number) => Promise<void>;
}) {
  return (
    <div className="row" style={{ marginTop: 12, display: "grid", gap: 12 }}>
      <SoundsCard settings={settings} sounds={sounds} onSetSound={onSetSound} onPreview={onPreviewSound} />
      <SeatingCard settings={settings} onSave={onSaveSeating} />
    </div>
  );
}
