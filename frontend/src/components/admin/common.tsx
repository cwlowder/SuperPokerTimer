import ConnectionStatus from "../ConnectionStatus";

export type Tab = "timer" | "players" | "tables" | "settings";

export function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={"btn" + (active ? " primary" : "")} onClick={onClick} style={{ padding: "8px 10px" }}>
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
      <TabButton active={tab === "timer"} onClick={() => setTab("timer")}>
        Timer
      </TabButton>
      <TabButton active={tab === "players"} onClick={() => setTab("players")}>
        Players
      </TabButton>
      <TabButton active={tab === "tables"} onClick={() => setTab("tables")}>
        Tables
      </TabButton>
      <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
        Settings
      </TabButton>
    </div>
  );
}
