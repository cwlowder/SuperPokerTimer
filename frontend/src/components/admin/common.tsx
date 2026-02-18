import ConnectionStatus from "../ConnectionStatus";
import { Timer, UsersRound, Settings } from "lucide-react";
import PokerTable from "../icons/PokerTable";
import { useTranslation } from "react-i18next";

export type Tab = "timer" | "players" | "tables" | "settings";

export function TabButton({
  active,
  onClick,
  title,
  children
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={"btn" + (active ? " primary" : "")}
      onClick={onClick}
      style={{ padding: "8px 10px" }}
      title={title}
    >
      {children}
    </button>
  );
}

export function AdminHeader({ connected }: { connected: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
      <h1 style={{ margin: 0 }}>{t("admin.title")}</h1>
      <ConnectionStatus />
    </div>
  );
}

export function AdminTabs({
  tab,
  setTab,
  size = 25
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  size?: number;
}) {
  const { t } = useTranslation();

  return (
    <div className="row" style={{ marginTop: 10, gap: 8 }}>
      <TabButton active={tab === "timer"} onClick={() => setTab("timer")} title={t("admin.tabs.timer")}>
        <Timer size={size} />
      </TabButton>
      <TabButton active={tab === "players"} onClick={() => setTab("players")} title={t("admin.tabs.players")}>
        <UsersRound size={size} />
      </TabButton>
      <TabButton active={tab === "tables"} onClick={() => setTab("tables")} title={t("admin.tabs.tables")}>
        <PokerTable size={size} />
      </TabButton>
      <TabButton active={tab === "settings"} onClick={() => setTab("settings")} title={t("admin.tabs.settings")}>
        <Settings size={size} />
      </TabButton>
    </div>
  );
}
