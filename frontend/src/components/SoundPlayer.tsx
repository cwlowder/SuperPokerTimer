import { Howl, Howler } from "howler";
import { useEffect } from "react";

import { useLocalSettingsCtx } from "../context/LocalSettingsContext";

const cache = new Map<string, Howl>();

let globalVolume = 1;

export function setGlobalVolume(volume: number) {
  globalVolume = volume;

  Howler.volume(volume);

  // Update all existing sounds
  cache.forEach((howl) => {
    howl.volume(volume);
  });
}

export function preloadSounds(files: string[]) {
  for (const file of files) {
    if (!file) continue;
    if (cache.has(file)) continue;

    const howl = new Howl({
      src: [`/sounds/${encodeURIComponent(file)}`],
      preload: true,
      html5: false,
      pool: 2,
      volume: globalVolume,
    });

    cache.set(file, howl);
  }
}


export function playSound(file: string | null) {
  if (!file) return;
  const howl = cache.get(file);
  if (howl) howl.play();
}


export default function SoundPlayer({
  file,
  playId,
  preloadFiles,
}: {
  file: string | null;
  playId?: number;
  preloadFiles?: string[];
}) {
  const { settings } = useLocalSettingsCtx();

  useEffect(() => {
    if (settings.volume !== undefined) {
      setGlobalVolume(settings.volume);
    }
  }, [settings?.volume]);

  useEffect(() => {
    if (!file) return;
    playSound(file);
  }, [file, playId]);

  useEffect(() => {
    if (!preloadFiles) return;
    preloadSounds(preloadFiles);
  }, [preloadFiles]);

  return null;
}
