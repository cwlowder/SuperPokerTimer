import { Howl } from "howler";
import { useEffect } from "react";

const cache = new Map<string, Howl>();

export function preloadSounds(files: string[]) {
  for (const file of files) {
    if (!file) continue;

    const howl = new Howl({
      src: [`/sounds/${encodeURIComponent(file)}`],
      preload: true,
      html5: false,
      pool: 2
    });

    cache.set(file, howl);
  }
}

export function playSound(file: string | null) {
  if (!file) return;
  const howl = cache.get(file);
  if (howl) howl.play();
}


export default function SoundPlayer({ file, playId, preloadFiles }: {
  file: string | null;
  playId?: number;
  preloadFiles?: string[];
}) {
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