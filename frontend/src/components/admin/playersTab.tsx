import { Player } from "../../types";
import { useTranslation } from "react-i18next";

export function PlayersTab({
  players,
  search,
  setSearch,
  newPlayer,
  setNewPlayer,
  onAddPlayer,
  onToggleElim,
  onDeletePlayer
}: {
  players: Player[];
  search: string;
  setSearch: (s: string) => void;
  newPlayer: string;
  setNewPlayer: (s: string) => void;
  onAddPlayer: () => Promise<void>;
  onToggleElim: (p: Player) => Promise<void>;
  onDeletePlayer: (p: Player) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>{t("admin.tabs.players")}</h3>

      <div className="grid2" style={{ alignItems: "end" }}>
        <div>
          <label>{t("players.addPlayer")}</label>
          <input
            className="input"
            value={newPlayer}
            onChange={(e) => setNewPlayer(e.target.value)}
            placeholder={t("players.name")}
          />
        </div>
        <button className="btn primary" onClick={onAddPlayer}>
          {t("players.addPlayer")}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>{t("players.search")}</label>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("players.searchPlaceholder")}
        />
        <div className="muted" style={{ marginTop: 6 }}>
          {t("players.searchHint")}
        </div>
      </div>

      <hr />

      <table className="table">
        <thead>
          <tr>
            <th>{t("players.columns.name")}</th>
            <th>{t("players.columns.status")}</th>
            <th style={{ width: 260 }}>{t("players.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td
                style={{
                  opacity: p.eliminated ? 0.6 : 1,
                  textDecoration: p.eliminated ? "line-through" : "none"
                }}
              >
                {p.name}
              </td>
              <td>
                <span className="badge">{p.eliminated ? t("players.eliminated_status") : t("players.active_status")}</span>
              </td>
              <td>
                <div className="row">
                  <button className="btn" onClick={() => onToggleElim(p)}>
                    {p.eliminated ? t("players.actions.undo") : t("players.actions.eliminate")}
                  </button>
                  <button className="btn danger" onClick={() => onDeletePlayer(p)}>
                    {t("players.actions.delete")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {players.length === 0 ? (
            <tr>
              <td colSpan={3} className="muted">
                {t("players.noPlayers")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
