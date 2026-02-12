import React, { useMemo } from "react";
import { Announcement, Player, Table } from "../types";

function fmtTs(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dedupeAnnouncements(items: Announcement[]): Announcement[] {
  const seen = new Set<string>();
  const out: Announcement[] = [];

  for (const a of items) {
    const key = `${a.type}:${a.created_at_ms}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }

  return out;
}

export default function Announcements({
  items,
  playersById,
  tablesById,
  compact = false
}: {
  items: Announcement[];
  playersById: Record<string, Player>;
  tablesById: Record<string, Table>;
  compact?: boolean;
}) {
  const unique = useMemo(() => dedupeAnnouncements(items), [items]);
  const show = unique.slice(0, compact ? 1 : 10);

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Announcements</h3>
        <span className="muted">{compact ? "Latest" : "Recent"}</span>
      </div>
      <hr />

      {show.length === 0 ? (
        <div className="muted">No announcements yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {show.map((a) => (
            <div
              key={`${a.type}:${a.created_at_ms}`}
              style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <div className="muted" style={{ fontSize: 12 }}>
                {fmtTs(a.created_at_ms)} • <span className="badge">{a.type}</span>
              </div>

              {a.type === "rebalance" ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 700 }}>{a.payload?.message ?? "Rebalance"}</div>

                  {Array.isArray(a.payload?.changes) && a.payload.changes.length > 0 ? (
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {a.payload.changes.slice(0, compact ? 50 : 500).map((c: any, idx: number) => {
                        const p = playersById[c.player_id]?.name ?? c.name ?? c.player_id;
                        const toT = tablesById[c.to_table]?.name ?? c.to_table;
                        const fromT = c.from_table
                          ? tablesById[c.from_table]?.name ?? c.from_table
                          : null;

                        return (
                          <li key={idx} className="muted">
                            <span style={{ fontWeight: 700, color: "#e7eef7" }}>{p}</span>{" "}
                            {fromT ? (
                              <>
                                from <span className="kbd">{fromT}</span> seat{" "}
                                <span className="kbd">{c.from_seat}</span>{" "}
                              </>
                            ) : null}
                            → <span className="kbd">{toT}</span> seat{" "}
                            <span className="kbd">{c.to_seat}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="muted" style={{ marginTop: 6 }}>
                      No seat changes.
                    </div>
                  )}
                </div>
              ) : a.type === "randomize" ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 700 }}>Seating randomized</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {a.payload?.message ?? "Players were randomly assigned to available seats."}
                  </div>
                </div>
              ) : a.type === "deseat" ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 700 }}>All players removed from seats</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {a.payload?.message ?? "All seats are now empty."}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 6 }} className="muted">
                  {JSON.stringify(a.payload)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
