import {
  Clock,
  ClockAlert,
  ClockCheck,
  ClockFading,
  WifiOff,
  Wifi
} from "lucide-react";
import { useEventStream } from "../hooks/useEventStream";

export default function ConnectionStatus({
  size = 16,
  muted = false,
}: {
  size?: number;
  muted?: boolean;
}) {
  const { connected, timerStatus } = useEventStream();

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

  // If muted, remove all color
  const wsFinalColor = muted ? "inherit" : wsColor;
  const timerFinalColor = muted ? "inherit" : timerColor;

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
    </div>
  );
}
