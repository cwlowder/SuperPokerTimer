import React, { useState, useEffect } from "react";
import { centsToMoney } from "../utils/time";

export default function MoneyDisplay({
  cents,
  size = 20,
  muted = false,
  editable = false,
  disabled = false,
  onChange
}: {
  cents: number;
  size?: number;
  muted?: boolean;
  editable?: boolean;
  disabled?: boolean;
  onChange?: (cents: number) => void;
}) {
  const { dollars, cents: cc } = centsToMoney(cents);

  const [draft, setDraft] = useState((cents / 100).toFixed(2));

  useEffect(() => {
    setDraft((cents / 100).toFixed(2));
  }, [cents]);

  if (editable) {
    return (
      <input
        className="input"
        type="number"
        step="0.25"
        min="0"
        value={draft}
        disabled={disabled}
        style={{
          fontSize: size,
          fontWeight: 800,
          width: 110,
          opacity: muted ? 0.8 : 1
        }}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);

          const parsed = Number(value);
          if (!isNaN(parsed) && onChange) {
            onChange(Math.round(parsed * 100));
          }
        }}
      />
    );
  }

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
