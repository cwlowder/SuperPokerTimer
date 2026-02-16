import { useState } from "react";
import { GripVertical } from "lucide-react";
import { Player, Seat, Table } from "../../types";

export function TablesTab({
  tables,
  seatsByTable,
  playersById,
  newTableName,
  setNewTableName,
  newTableSeats,
  setNewTableSeats,
  onAddTable,
  onUpdateTable,
  onDeleteTable,
  onToggleEnabled,
  onRandomize,
  onRebalance,
  onDeseat,
  onMoveSeat
}: {
  tables: Table[];
  seatsByTable: Record<string, Seat[]>;
  playersById: Record<string, Player>;
  newTableName: string;
  setNewTableName: (s: string) => void;
  newTableSeats: number;
  setNewTableSeats: (n: number) => void;
  onAddTable: () => Promise<void>;
  onUpdateTable: (t: Table, patch: Partial<Table>) => Promise<void>;
  onDeleteTable: (t: Table) => Promise<void>;
  onToggleEnabled: (t: Table) => Promise<void>;
  onRandomize: () => Promise<void>;
  onRebalance: () => Promise<void>;
  onDeseat: () => Promise<void>;
  onMoveSeat: (playerId: string, toTableId: string, toSeatNum: number) => Promise<void>;
}) {
  const [dragPid, setDragPid] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // `${tableId}:${seatNum}`

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>Tables & Seating</h3>

      <div className="grid2" style={{ alignItems: "end" }}>
        <div>
          <label>New table name</label>
          <input className="input" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} />
        </div>
        <div>
          <label>Seats</label>
          <input
            className="input"
            type="number"
            value={newTableSeats}
            onChange={(e) => setNewTableSeats(Number(e.target.value))}
            min={2}
            max={12}
          />
        </div>
      </div>

      <div style={{ marginTop: 10 }} className="row">
        <button className="btn primary" onClick={onAddTable}>
          Add table
        </button>
        <button className="btn" onClick={onRandomize}>
          Randomize
        </button>
        <button className="btn" onClick={onRebalance}>
          Rebalance
        </button>
        <button className="btn" onClick={onDeseat}>
          Deseat
        </button>
      </div>

      <hr />

      <div style={{ display: "grid", gap: 12 }}>
        {tables.map((t) => (
          <div
            key={t.id}
            style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 12 }}
          >
            <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {t.name} <span className="muted">(seats {t.seats})</span>
                </div>
                <span className="badge">{t.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <div className="row">
                <button className="btn" onClick={() => onToggleEnabled(t)}>
                  {t.enabled ? "Disable" : "Enable"}
                </button>
                <button className="btn danger" onClick={() => onDeleteTable(t)}>
                  Delete
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10 }} className="grid2">
              <div>
                <label>Rename</label>
                <input className="input" defaultValue={t.name} onBlur={(e) => onUpdateTable(t, { name: e.target.value })} />
              </div>
              <div>
                <label>Seats</label>
                <input
                  className="input"
                  type="number"
                  defaultValue={t.seats}
                  min={2}
                  max={12}
                  onBlur={(e) => onUpdateTable(t, { seats: Number(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>
                Seats
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                {(seatsByTable[t.id] ?? []).map((s) => {
                  const p = s.player_id ? playersById[s.player_id] : null;
                  const key = `${s.table_id}:${s.seat_num}`;
                  const isOver = dragOver === key;
                  const isDragging = dragPid === (p?.id ?? "");

                  return (
                    <div
                      key={key}
                      draggable={!!p}
                      onDragStart={(e) => {
                        if (!p) return;
                        setDragPid(p.id);
                        e.dataTransfer.setData("text/player-id", p.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragPid(null);
                        setDragOver(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(key);
                      }}
                      onDragLeave={() => setDragOver((cur) => (cur === key ? null : cur))}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const playerId = e.dataTransfer.getData("text/player-id") || dragPid;
                        setDragOver(null);
                        setDragPid(null);
                        if (!playerId) return;
                        await onMoveSeat(playerId, s.table_id, s.seat_num);
                      }}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.10)",
                        outline: isOver ? "2px solid rgba(120,200,255,0.6)" : "none",
                        background: isOver ? "rgba(120,200,255,0.08)" : "transparent",
                        opacity: isDragging ? 0.55 : 1,
                        cursor: p ? "grab" : "default",
                        userSelect: "none",
                        transition: "background 120ms ease, outline 120ms ease, opacity 120ms ease"
                      }}
                      title={p ? "Drag to move (drops swap by default)" : "Drop a player here"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {p ? (
                          <GripVertical
                            size={14}
                            style={{
                              opacity: 0.35,        // more muted
                              flex: "0 0 auto"
                            }}
                          />
                        ) : (
                          <div style={{ width: 14, flex: "0 0 auto" }} />
                        )}

                        <div style={{ minWidth: 0 }}>
                          <div className="muted" style={{ fontSize: 12 }}>
                            Seat {s.seat_num}
                          </div>
                          <div style={{ fontWeight: 800, opacity: p?.eliminated ? 0.6 : 1 }}>
                            {p ? p.name : <span className="muted">—</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {tables.length === 0 ? <div className="muted">No tables yet.</div> : null}
      </div>
    </div>
  );
}
