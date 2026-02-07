import { useEffect } from "react";

export default function SoundPlayer({
  file,
  playId,
}: {
  file: string | null;
  playId?: number; // optional for local previews
}) {
  useEffect(() => {
    if (!file) return;
    const url = `/sounds/${encodeURIComponent(file)}`;
    const audio = new Audio(url);
    audio.volume = 1.0;
    audio.play().catch(() => {});
    return () => {
      try { audio.pause(); } catch {}
    };
  }, [file, playId]); // ✅ playId forces replay even if file same

  return null;
}