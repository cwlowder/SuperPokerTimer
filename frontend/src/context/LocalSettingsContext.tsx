import React from "react";
import { useLocalSettings } from "../hooks/useLocalSettings";

type LocalSettingsCtxValue = ReturnType<typeof useLocalSettings>;

const LocalSettingsCtx = React.createContext<LocalSettingsCtxValue | null>(null);

export function LocalSettingsProvider({ children }: { children: React.ReactNode }) {
  const value = useLocalSettings();
  return <LocalSettingsCtx.Provider value={value}>{children}</LocalSettingsCtx.Provider>;
}

export function useLocalSettingsCtx() {
  const ctx = React.useContext(LocalSettingsCtx);
  if (!ctx) throw new Error("useLocalSettingsCtx must be used within LocalSettingsProvider");
  return ctx;
}