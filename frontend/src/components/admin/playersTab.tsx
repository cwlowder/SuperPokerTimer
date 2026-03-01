import React, { useMemo, useState } from "react";
import { Player } from "../../types";
import { useTranslation } from "react-i18next";

function AddPlayersModal({
  open,
  players,
  onAddPlayer,
  onClose
}: {
  open: boolean;
  players: Player[];
  onAddPlayer: (name?: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const [input, setInput] = useState("");
  const [pendingPlayers, setPendingPlayers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const existingNames = useMemo(() => {
    return new Set(players.map((p) => p.name.trim().toLowerCase()).filter(Boolean));
  }, [players]);

  function normalizeName(s: string) {
    return s.trim().replace(/\s+/g, " ");
  }

  function addOne(nameRaw: string) {
    const name = normalizeName(nameRaw);
    if (!name) return;

    const key = name.toLowerCase();
    if (existingNames.has(key)) return;
    if (pendingPlayers.some((p) => p.toLowerCase() === key)) return;

    setPendingPlayers((prev) => [...prev, name]);
  }

  function addFromInput() {
    const parts = (input || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return;

    parts.forEach(addOne);
    setInput("");
  }

  function removePending(idx: number) {
    setPendingPlayers((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetAndClose() {
    setInput("");
    setPendingPlayers([]);
    setSubmitting(false);
    onClose();
  }

  async function confirmAddAll() {
    if (pendingPlayers.length === 0) return;

    setSubmitting(true);
    try {
      for (const name of pendingPlayers) {
        await onAddPlayer(name);
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
          <h3 style={{ margin: 0 }}>{t("players.addPlayer")}</h3>
          <button className="btn" onClick={resetAndClose} disabled={submitting}>
            {t("common.close")}
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6 }}>{t("players.addModalHint")}</div>

        <div className="grid2" style={{ alignItems: "end", marginTop: 12 }}>
          <div>
            <label>{t("players.name")}</label>
            <input
              className="input"
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes(",")) {
                  const pieces = val.split(",");
                  const last = pieces.pop() ?? "";
                  pieces
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .forEach(addOne);
                  setInput(last);
                } else {
                  setInput(val);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFromInput();
                }
              }}
              placeholder={t("players.name")}
              disabled={submitting}
              autoFocus
            />
          </div>

          <button className="btn" onClick={addFromInput} disabled={submitting || !input.trim()}>
            {t("players.actions.addToList")}
          </button>
        </div>

        <hr />

        <div>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0 }}>{t("players.pendingTitle")}</h4>
            <span className="badge">{pendingPlayers.length}</span>
          </div>

          {pendingPlayers.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>
              {t("players.pendingEmpty")}
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {pendingPlayers.map((name, idx) => (
                <div key={`${name}-${idx}`} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>{name}</div>
                  <button className="btn danger" onClick={() => removePending(idx)} disabled={submitting}>
                    {t("players.actions.remove")}
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
            disabled={submitting || pendingPlayers.length === 0}
          >
            {submitting ? t("common.saving") : t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlayersTab({
  players,
  search,
  setSearch,
  seatByPlayer,
  onAddPlayer,
  onRenamePlayer,
  onToggleElim,
  onDeletePlayer
}: {
  players: Player[];
  search: string;
  setSearch: (s: string) => void;
  seatByPlayer: Record<string, { tableName: string; seatNum: number } | undefined>;
  onAddPlayer: (name?: string) => Promise<void>;
  onRenamePlayer: (p: Player, name: string) => Promise<void>;
  onToggleElim: (p: Player) => Promise<void>;
  onDeletePlayer: (p: Player) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>{t("admin.tabs.players")}</h3>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="muted">{t("players.addHint")}</div>
        <button className="btn primary" onClick={() => setAddOpen(true)}>
          {t("players.addPlayer")}
        </button>
      </div>

      <AddPlayersModal
        open={addOpen}
        players={players}
        onAddPlayer={onAddPlayer}
        onClose={() => setAddOpen(false)}
      />

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
            <th>{t("players.columns.seat")}</th>
            <th style={{ width: 260 }}>{t("players.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr
              key={p.id}
              style={
                p.eliminated
                  ? {
                      backgroundColor: "rgba(255, 50, 50, 0.15)"
                    }
                  : undefined
              }
            >
              <td
                style={{
                  opacity: p.eliminated ? 0.6 : 1,
                  textDecoration: p.eliminated ? "line-through" : "none"
                }}
              >
                <input
                  className="input"
                  defaultValue={p.name}
                  disabled={p.eliminated}
                  onBlur={(e) => onRenamePlayer(p, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      (e.target as HTMLInputElement).value = p.name;
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  style={{
                    fontWeight: 800,
                    background: "transparent",
                    borderColor: "rgba(255,255,255,0.10)",
                    padding: "8px 10px",
                    maxWidth: 360
                  }}
                  title={p.eliminated ? "" : t("players.renameHint")}
                />
              </td>
              <td>
                <span className="badge">
                  {p.eliminated ? t("players.eliminated_status") : t("players.active_status")}
                </span>
              </td>
              <td>
                {seatByPlayer[p.id] ? (
                  <span className="badge">
                    {(seatByPlayer[p.id]?.tableName || "").trim() || t("tables.title")} {t("tables.seatNumber", { num: seatByPlayer[p.id]!.seatNum })}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
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
              <td colSpan={4} className="muted">
                {t("players.noPlayers")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
