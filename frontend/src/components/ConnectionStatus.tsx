import {
  Clock,
  ClockAlert,
  ClockCheck,
  ClockFading,
  WifiOff,
  Wifi,
  Volume1,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { useEventStream } from "../hooks/useEventStream";
import { halfVolume, fullVolume } from "../hooks/useLocalSettings";
import { useLocalSettingsCtx } from "../context/LocalSettingsContext";

export default function ConnectionStatus({
  size = 16,
  muted = false,
}: {
  size?: number;
  muted?: boolean;
}) {
  const { connected, timerStatus } = useEventStream();
  const { settings, cycleVolume } = useLocalSettingsCtx();

  // ---- WebSocket status ----
  const wsIcon = connected ? (
    <Wifi size={size} />
  ) : (
    <WifiOff size={size} />
  );

  const wsColor = connected
    ? "var(--color-success, #22c55e)"
    : "var(--color-danger, #ef4444)";

  const wsLabel = connected ? "Connected" : "Disconnected";

  // ---- Timer sync status ----
  let timerIcon = <ClockFading size={size} />;
  let timerColor = "#9ca3af";
  let timerLabel = "Unknown";

  if (timerStatus === "neutral" || !connected) {
    timerIcon = <ClockFading size={size} />;
    timerColor = "#eab308";
    timerLabel = "Syncing";
  } else if (timerStatus === "excelent") {
    timerIcon = <ClockCheck size={size} />;
    timerColor = "#22c55e";
    timerLabel = "Stable";
  } else if (timerStatus === "good") {
    timerIcon = <Clock size={size} />;
    timerColor = "#22c55e";
    timerLabel = "In Sync";
  } else if (timerStatus === "bad") {
    timerIcon = <ClockAlert size={size} />;
    timerColor = "#ef4444";
    timerLabel = "Out of Sync";
  }

  let soundIcon = <VolumeOff size={size} />;
  let soundColor = "#ef4444";
  let soundLabel = "Sound off";

  if (settings.volume === halfVolume) {
    soundIcon = <Volume1 size={size} />;
    soundColor = "#9ca3af";
    soundLabel = "50%";
  } else if (settings.volume === fullVolume) {
    soundIcon = <Volume2 size={size} />;
    soundColor = "#9ca3af";
    soundLabel = "100%";
  }

  // If muted, remove all color
  const wsFinalColor = muted ? "inherit" : wsColor;
  const timerFinalColor = muted ? "inherit" : timerColor;
  const soundFinalColor = muted ? "inherit" : soundColor;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        fontWeight: 600,
        opacity: muted ? 0.75 : 1
      }}
    >
      {/* WebSocket */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: wsFinalColor
        }}
        title={wsLabel}
      >
        {wsIcon}
      </div>

      {/* Timer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: timerFinalColor
        }}
        title={timerLabel}
      >
        {timerIcon}
      </div>
      <div
        onClick={cycleVolume}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: soundFinalColor
        }}
        title={soundLabel}
      >
        {soundIcon}
      </div>
    </div>
  );
}
