import { Player } from "../../types";

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
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>Players</h3>
      <div className="grid2" style={{ alignItems: "end" }}>
        <div>
          <label>Add player</label>
          <input className="input" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} placeholder="Name" />
        </div>
        <button className="btn primary" onClick={onAddPlayer}>
          Add
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>Search</label>
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" />
        <div className="muted" style={{ marginTop: 6 }}>
          Search applies on Reload.
        </div>
      </div>

      <hr />

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th style={{ width: 260 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td style={{ opacity: p.eliminated ? 0.6 : 1, textDecoration: p.eliminated ? "line-through" : "none" }}>
                {p.name}
              </td>
              <td>
                <span className="badge">{p.eliminated ? "Eliminated" : "Active"}</span>
              </td>
              <td>
                <div className="row">
                  <button className="btn" onClick={() => onToggleElim(p)}>
                    {p.eliminated ? "Undo" : "Eliminate"}
                  </button>
                  <button className="btn danger" onClick={() => onDeletePlayer(p)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {players.length === 0 ? (
            <tr>
              <td colSpan={3} className="muted">
                No players.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}