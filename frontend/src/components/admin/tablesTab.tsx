import React, { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { Player, Seat, Table } from "../../types";
import { useTranslation } from "react-i18next";

function AddTablesModal({
  open,
  tables,
  onAddTable,
  onClose
}: {
  open: boolean;
  tables: Table[];
  onAddTable: (name: string, seats: number) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const [nameInput, setNameInput] = useState("");
  const [seatsInput, setSeatsInput] = useState<number>(9);
  const [pending, setPending] = useState<Array<{ name: string; seats: number }>>([]);
  const [submitting, setSubmitting] = useState(false);

  const existingNames = useMemo(() => {
    return new Set(tables.map((tb) => tb.name.trim().toLowerCase()).filter(Boolean));
  }, [tables]);

  function normalizeName(s: string) {
    return s.trim().replace(/\s+/g, " ");
  }

  function clampSeats(n: number) {
    if (!Number.isFinite(n)) return 9;
    return Math.max(2, Math.min(12, Math.floor(n)));
  }

  function addOne(nameRaw: string, seatsRaw: number) {
    const name = normalizeName(nameRaw);
    if (!name) return;

    const key = name.toLowerCase();
    if (existingNames.has(key)) return;
    if (pending.some((p) => p.name.toLowerCase() === key)) return;

    setPending((prev) => [...prev, { name, seats: clampSeats(seatsRaw) }]);
  }

  function addFromInput() {
    const parts = (nameInput || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return;

    parts.forEach((nm) => addOne(nm, seatsInput));
    setNameInput("");
  }

  function removePending(idx: number) {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetAndClose() {
    setNameInput("");
    setSeatsInput(9);
    setPending([]);
    setSubmitting(false);
    onClose();
  }

  async function confirmAddAll() {
    if (pending.length === 0) return;

    setSubmitting(true);
    try {
      for (const item of pending) {
        await onAddTable(item.name, item.seats);
      }
      resetAndClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resetAndClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999
      }}
    >
      <div
        className="modal-card"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(80vh, 800px)",
          overflow: "auto"
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{t("tables.addTable")}</h3>
          <button className="btn" onClick={resetAndClose} disabled={submitting}>
            {t("common.close")}
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6 }}>{t("tables.addModalHint")}</div>

        <div className="grid2" style={{ alignItems: "end", marginTop: 12 }}>
          <div>
            <label>{t("tables.name")}</label>
            <input
              className="input"
              value={nameInput}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes(",")) {
                  const pieces = val.split(",");
                  const last = pieces.pop() ?? "";
                  pieces
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .forEach((nm) => addOne(nm, seatsInput));
                  setNameInput(last);
                } else {
                  setNameInput(val);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFromInput();
                }
              }}
              placeholder={t("tables.name")}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div>
            <label>{t("tables.seats")}</label>
            <input
              className="input"
              type="number"
              value={seatsInput}
              onChange={(e) => setSeatsInput(clampSeats(Number(e.target.value)))}
              min={2}
              max={12}
              disabled={submitting}
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={addFromInput} disabled={submitting || !nameInput.trim()}>
            {t("tables.actions.addToList")}
          </button>
        </div>

        <hr />

        <div>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0 }}>{t("tables.pendingTitle")}</h4>
            <span className="badge">{pending.length}</span>
          </div>

          {pending.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>
              {t("tables.pendingEmpty")}
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {pending.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{item.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t("tables.seatsCount", { count: item.seats })}
                    </div>
                  </div>
                  <button className="btn danger" onClick={() => removePending(idx)} disabled={submitting}>
                    {t("tables.actions.remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr />

        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button className="btn" onClick={resetAndClose} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button
            className={"btn primary" + (submitting ? " disabled" : "")}
            onClick={confirmAddAll}
            disabled={submitting || pending.length === 0}
          >
            {submitting ? t("common.saving") : t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TablesTab({
  tables,
  seatsByTable,
  playersById,
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
  onAddTable: (name: string, seats: number) => Promise<void>;
  onUpdateTable: (t: Table, patch: Partial<Table>) => Promise<void>;
  onDeleteTable: (t: Table) => Promise<void>;
  onToggleEnabled: (t: Table) => Promise<void>;
  onRandomize: () => Promise<void>;
  onRebalance: () => Promise<void>;
  onDeseat: () => Promise<void>;
  onMoveSeat: (playerId: string, toTableId: string, toSeatNum: number) => Promise<void>;
}) {
  const { t } = useTranslation();

  const [addOpen, setAddOpen] = useState(false);

  const [dragPid, setDragPid] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // `${tableId}:${seatNum}`

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>{t("tables.title")}</h3>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="muted">{t("tables.addHint")}</div>
        <button className="btn primary" onClick={() => setAddOpen(true)}>
          {t("tables.actions.add")}
        </button>
      </div>

      <AddTablesModal
        open={addOpen}
        tables={tables}
        onAddTable={onAddTable}
        onClose={() => setAddOpen(false)}
      />

      <div style={{ marginTop: 10 }} className="row">
        <button className="btn" onClick={onRandomize}>
          {t("tables.actions.randomize")}
        </button>
        <button className="btn" onClick={onRebalance}>
          {t("tables.actions.rebalance")}
        </button>
        <button className="btn" onClick={onDeseat}>
          {t("tables.actions.deseat")}
        </button>
      </div>

      <hr />

      <div style={{ display: "grid", gap: 12 }}>
        {tables.map((tbl) => (
          <div
            key={tbl.id}
            style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 12 }}
          >
            <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {tbl.name} <span className="muted">({t("tables.seatsCount", { count: tbl.seats })})</span>
                </div>
                <span className="badge">{tbl.enabled ? t("common.enabled") : t("common.disabled")}</span>
              </div>
              <div className="row">
                <button className="btn" onClick={() => onToggleEnabled(tbl)}>
                  {tbl.enabled ? t("tables.actions.disable") : t("tables.actions.enable")}
                </button>
                <button className="btn danger" onClick={() => onDeleteTable(tbl)}>
                  {t("common.delete")}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10 }} className="grid2">
              <div>
                <label>{t("tables.rename")}</label>
                <input
                  className="input"
                  defaultValue={tbl.name}
                  onBlur={(e) => onUpdateTable(tbl, { name: e.target.value })}
                />
              </div>
              <div>
                <label>{t("tables.seats")}</label>
                <input
                  className="input"
                  type="number"
                  defaultValue={tbl.seats}
                  min={2}
                  max={12}
                  onBlur={(e) => onUpdateTable(tbl, { seats: Number(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>
                {t("tables.seating")}
              </div>
              {/*
                Seat layout: 6x2 grid.
                Fill from upper-left left-to-right, but keep numbering clockwise:
                  seats=6  => 1,2,3,_,_,_ / 6,5,4,_,_,_
                  seats=12 => 1..6 / 12..7
              */}
              <div style={{ overflowX: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, minmax(160px, 1fr))",
                    gap: 8,
                    minWidth: 6 * 160 + 5 * 8
                  }}
                >
                  {(() => {
                    const seatList = seatsByTable[tbl.id] ?? [];
                    const byNum = new Map<number, Seat>();
                    for (const s of seatList) byNum.set(s.seat_num, s);

                    const tiles: Array<{ key: string; seat: Seat | null; enabled: boolean }> = [];

                    const total = Math.max(0, Math.min(12, Math.floor(Number(tbl.seats) || 0)));
                    const colsUsed = Math.max(1, Math.min(6, Math.ceil(total / 2)));
                    const bottomMax = Math.min(total, colsUsed * 2);

                    // Row 1: seats 1..colsUsed (left to right)
                    for (let col = 0; col < 6; col++) {
                      const seatNum = col + 1;
                      const enabled = col < colsUsed && seatNum <= total;
                      const s = enabled ? byNum.get(seatNum) : undefined;
                      tiles.push({
                        key: enabled ? `${tbl.id}:${seatNum}` : `${tbl.id}:disabled:top:${col}`,
                        seat: enabled
                          ? {
                              table_id: tbl.id,
                              table_name: tbl.name,
                              seat_num: seatNum,
                              player_id: s?.player_id ?? null
                            }
                          : null,
                        enabled
                      });
                    }

                    // Row 2: seats bottomMax..(colsUsed+1) (left to right)
                    for (let col = 0; col < 6; col++) {
                      const seatNum = bottomMax - col;
                      const enabled = col < colsUsed && seatNum > colsUsed && seatNum <= total;
                      const s = enabled ? byNum.get(seatNum) : undefined;
                      tiles.push({
                        key: enabled ? `${tbl.id}:${seatNum}` : `${tbl.id}:disabled:bottom:${col}`,
                        seat: enabled
                          ? {
                              table_id: tbl.id,
                              table_name: tbl.name,
                              seat_num: seatNum,
                              player_id: s?.player_id ?? null
                            }
                          : null,
                        enabled
                      });
                    }

                    return tiles.map(({ key, seat, enabled }) => {
                      const p = enabled && seat?.player_id ? playersById[seat.player_id] : null;
                      const isOver = enabled && dragOver === key;
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
                            if (!enabled) return;
                            e.preventDefault();
                            setDragOver(key);
                          }}
                          onDragLeave={() => setDragOver((cur) => (cur === key ? null : cur))}
                          onDrop={async (e) => {
                            if (!enabled) return;
                            e.preventDefault();
                            const playerId = e.dataTransfer.getData("text/player-id") || dragPid;
                            setDragOver(null);
                            setDragPid(null);
                            if (!playerId) return;
                            if (!seat) return;
                            await onMoveSeat(playerId, seat.table_id, seat.seat_num);
                          }}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.10)",
                            outline: isOver ? "2px solid rgba(120,200,255,0.6)" : "none",
                            background: isOver ? "rgba(120,200,255,0.08)" : "transparent",
                            opacity: !enabled ? 0.25 : isDragging ? 0.55 : 1,
                            cursor: p ? "grab" : enabled ? "default" : "not-allowed",
                            userSelect: "none",
                            transition: "background 120ms ease, outline 120ms ease, opacity 120ms ease"
                          }}
                          title={!enabled ? "" : p ? t("tables.dragMoveHint") : t("tables.dropHint")}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {p ? (
                              <GripVertical
                                size={14}
                                style={{
                                  opacity: 0.35,
                                  flex: "0 0 auto"
                                }}
                              />
                            ) : (
                              <div style={{ width: 14, flex: "0 0 auto" }} />
                            )}

                            <div style={{ minWidth: 0 }}>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {enabled && seat ? t("tables.seatNumber", { num: seat.seat_num }) : ""}
                              </div>
                              <div
                                className={p?.eliminated ? "crossed-out" : undefined}
                                style={{
                                  fontWeight: 800,
                                  opacity: p?.eliminated ? 0.6 : 1
                                }}
                              >
                                {enabled ? (p ? p.name : <span className="muted">—</span>) : <span className="muted"> </span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        ))}

        {tables.length === 0 ? <div className="muted">{t("tables.noTables")}</div> : null}
      </div>
    </div>
  );
}
