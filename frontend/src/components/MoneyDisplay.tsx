import React from "react";
import { centsToMoney } from "../utils/time";

export default function MoneyDisplay({
  cents,
  size = 20,
  muted = false
}: {
  cents: number;
  size?: number;
  muted?: boolean;
}) {
  const { dollars, cents: cc } = centsToMoney(cents);
  return (
    <span style={{ fontSize: size, fontWeight: 800, opacity: muted ? 0.8 : 1 }}>
      ${dollars}
      <span
        style={{
          fontSize: Math.max(12, Math.round(size * 0.62)),
          position: "relative",
          top: -Math.round(size * 0.22),
          marginLeft: 1,
          fontWeight: 800,
          opacity: 0.95
        }}
      >
        {cc}
      </span>
    </span>
  );
}
