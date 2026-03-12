import React, { useState, useEffect } from "react";
import { centsToMoney, centsToWhole } from "../utils/money";
import { Denomination } from "../types";

export default function MoneyDisplay({
  cents,
  size = 20,
  muted = false,
  editable = false,
  disabled = false,
  increment = 0.1,
  currencySymbol = "$",
  denomination = "cents",
  onChange
}: {
  cents: number;
  size?: number;
  muted?: boolean;
  editable?: boolean;
  disabled?: boolean;
  increment?: number;
  currencySymbol?: string;
  denomination?: Denomination;
  onChange?: (cents: number) => void;
}) {
  const isWhole = denomination === "whole";
  const isEditableDisabled = editable && disabled;

  // For "whole" mode the stored value IS the display value (no /100 conversion).
  // For "cents" mode the stored value is cents, display is dollars.cents.
  const toDisplay = (c: number) => isWhole ? String(c) : (c / 100).toFixed(2);
  const fromDisplay = (v: number) => isWhole ? Math.round(v) : Math.round(v * 100);
  const editStep = isWhole ? 1 : increment;

  const [draft, setDraft] = useState(toDisplay(cents));

  useEffect(() => {
    setDraft(toDisplay(cents));
  }, [cents, denomination]);

  if (editable) {
    return (
      <input
        className="input"
        type="number"
        step={isWhole ? String(editStep) : editStep.toFixed(2)}
        min="0"
        value={draft}
        disabled={disabled}
        style={{
          fontSize: size,
          fontWeight: 800,
          width: 110,
          opacity: isEditableDisabled ? 0.5 : muted ? 0.8 : 1,
          cursor: isEditableDisabled ? "not-allowed" : "text",
          color: isEditableDisabled ? "rgba(231, 238, 247, 0.7)" : undefined
        }}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);

          const parsed = Number(value);
          if (!isNaN(parsed) && onChange) {
            onChange(fromDisplay(parsed));
          }
        }}
      />
    );
  }

  if (isWhole) {
    const display = centsToWhole(cents);
    return (
      <span style={{ fontSize: size, fontWeight: 800, opacity: muted ? 0.8 : 1 }}>
        {currencySymbol}{display}
      </span>
    );
  }

  const { dollars, cents: cc } = centsToMoney(cents);

  return (
    <span style={{ fontSize: size, fontWeight: 800, opacity: muted ? 0.8 : 1 }}>
      {currencySymbol}{dollars}
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
