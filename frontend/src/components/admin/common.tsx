import ConnectionStatus from "../ConnectionStatus";
import { Timer, UsersRound, Settings } from "lucide-react";
import PokerTable from "../icons/PokerTable";

export type Tab = "timer" | "players" | "tables" | "settings";

export function TabButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string; 
  children: React.ReactNode;
}) {
  return (
    <button className={"btn" + (active ? " primary" : "")} onClick={onClick} style={{ padding: "8px 10px" }} title={title}>
      {children}
    </button>
  );
}

export function AdminHeader({ connected }: { connected: boolean }) {
  return (
    <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
      <h1 style={{ margin: 0 }}>Poker Tourney Admin</h1>
      <ConnectionStatus/>
    </div>
  );
}

export function AdminTabs({
  tab,
  setTab,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  return (
    <div className="row" style={{ marginTop: 10, gap: 8 }}>
      <TabButton active={tab === "timer"} onClick={() => setTab("timer")} title={"Timer"}>
        <Timer size={20} />
      </TabButton>
      <TabButton active={tab === "players"} onClick={() => setTab("players")} title={"Players"}>
        <UsersRound size={20} />
      </TabButton>
      <TabButton active={tab === "tables"} onClick={() => setTab("tables")} title={"Tables"}>
        <PokerTable size={20} />
      </TabButton>
      <TabButton active={tab === "settings"} onClick={() => setTab("settings")} title={"Settings"}>
        <Settings size={20} />
      </TabButton>
    </div>
  );
}
