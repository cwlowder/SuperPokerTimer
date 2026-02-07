import { useEffect } from "react";

export default function SoundPlayer({ file }: { file: string | null }) {
  useEffect(() => {
    if (!file) return;
    const url = `/sounds/${encodeURIComponent(file)}`;
    const audio = new Audio(url);
    audio.volume = 1.0;
    audio.play().catch(() => {});
    return () => {
      try { audio.pause(); } catch {}
    };
  }, [file]);

  return null;
}
