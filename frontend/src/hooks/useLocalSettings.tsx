import { useEffect, useState } from "react";

export const fullVolume = 1;
export const halfVolume = 0.5;
export const noVolume = 0;

type VolumeLevel = noVolume | halfVolume | fullVolume;

export interface LocalSettings {
  volume: VolumeLevel;
}

const STORAGE_KEY = "timer_settings";

const defaultSettings: LocalSettings = {
  volume: fullVolume,
};

function loadSettings(): LocalSettings {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultSettings;

  try {
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return defaultSettings;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function useLocalSettings() {
  const [settings, setSettings] = useState<LocalSettings>(() => loadSettings());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const cycleVolume = () => {
    setSettings((prev) => ({
      ...prev,
      volume: prev.volume === fullVolume ? halfVolume : prev.volume === halfVolume ? noVolume : fullVolume,
    }));
  };

  return {
    settings,
    setSettings,
    cycleVolume,
  };
}
