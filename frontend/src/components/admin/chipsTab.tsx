import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";

import MoneyDisplay from "../MoneyDisplay";
import { apiGet, apiPost } from "../../utils/api";
import { ChipColor, ChipPlan, ChipSettings, ChipSpec, ChipStackPlan, Denomination, Settings } from "../../types";

const FALLBACK_SETTINGS: ChipSettings = {
  enabled: true,
  color_ups: true,
  players_override: null,
  max_rebuys: 0,
  starting_stack_cents: 500,
  rebuy_stack_cents: 500,
  chips: []
};

/** A poker chip: colored disc with the dashed edge stripes of a dice-edge set. */
export function ChipSwatch({
  color,
  size = 26,
  struck = false
}: {
  color?: ChipColor;
  size?: number;
  struck?: boolean;
}) {
  return (
    <span
      title={color?.label}
      style={{ position: "relative", display: "inline-flex", flex: "0 0 auto", width: size, height: size }}
    >
      <span
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background: color?.hex ?? "#888",
          border: `${Math.max(2, Math.round(size * 0.12))}px dashed rgba(0,0,0,0.4)`,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.3)",
          opacity: struck ? 0.55 : 1
        }}
      />
      {struck ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {/* Drawn twice so the cross stays visible on both light and dark chips. */}
          <g strokeLinecap="round" fill="none">
            <path d="M4 4 L20 20 M20 4 L4 20" stroke="rgba(0,0,0,0.55)" strokeWidth={5} />
            <path d="M4 4 L20 20 M20 4 L4 20" stroke={color?.ink ?? "#fff"} strokeWidth={2.5} />
          </g>
        </svg>
      ) : null}
    </span>
  );
}

function ChipCountPill({
  color,
  count,
  denomCents,
  currencySymbol,
  denomination
}: {
  color?: ChipColor;
  count: number;
  denomCents: number;
  currencySymbol: string;
  denomination: Denomination;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px 6px 8px",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 999
      }}
    >
      <ChipSwatch color={color} />
      <span style={{ fontSize: 20, fontWeight: 800 }}>{count}</span>
      <span className="muted" style={{ fontSize: 13 }}>×</span>
      <MoneyDisplay cents={denomCents} size={16} currencySymbol={currencySymbol} denomination={denomination} />
    </div>
  );
}

function StackCard({
  title,
  subtitle,
  stack,
  perStackLabel,
  totalLabel,
  colorsById,
  currencySymbol,
  denomination
}: {
  title: string;
  subtitle: string;
  stack: ChipStackPlan | null;
  perStackLabel: string;
  totalLabel: string;
  colorsById: Record<string, ChipColor>;
  currencySymbol: string;
  denomination: Denomination;
}) {
  const { t } = useTranslation();
  if (!stack) return null;
  return (
    <div className="card">
      <h3 style={{ marginBottom: 2 }}>{title}</h3>
      <div className="muted">{subtitle}</div>
      <hr />

      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{perStackLabel}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {stack.chips.map((c) => (
          <ChipCountPill
            key={c.color}
            color={colorsById[c.color]}
            count={c.count}
            denomCents={c.denom_cents}
            currencySymbol={currencySymbol}
            denomination={denomination}
          />
        ))}
      </div>

      <hr />

      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{totalLabel}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {stack.chips.map((c) => (
          <ChipCountPill
            key={c.color}
            color={colorsById[c.color]}
            count={c.total}
            denomCents={c.denom_cents}
            currencySymbol={currencySymbol}
            denomination={denomination}
          />
        ))}
      </div>

      <hr />
      <div className="row" style={{ gap: 24 }}>
        <div>
          <div className="muted">{t("chips.plan.stackValue")}</div>
          <MoneyDisplay cents={stack.stack_cents} size={22} currencySymbol={currencySymbol} denomination={denomination} />
        </div>
        <div>
          <div className="muted">{t("chips.plan.chipsPerStack")}</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stack.total_chips}</div>
        </div>
        <div>
          <div className="muted">{t("chips.plan.stacksNeeded")}</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stack.stacks}</div>
        </div>
        <div>
          <div className="muted">{t("chips.plan.chipsTotal")}</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stack.total_chips_all}</div>
        </div>
      </div>
    </div>
  );
}

function Notices({ plan, colorsById }: { plan: ChipPlan; colorsById: Record<string, ChipColor> }) {
  const { t } = useTranslation();
  const items: { tone: "error" | "warn"; text: string }[] = [];
  const label = (id?: string) => (id ? colorsById[id]?.label ?? id : "");

  for (const e of plan.errors) {
    items.push({ tone: "error", text: t(`chips.errors.${e.code}`, { ...e, color: label(e.color), defaultValue: e.code }) });
  }
  for (const w of plan.warnings) {
    if (w.code === "levels_not_payable") {
      const levels = (w.levels ?? []).map((l: any) => l.level_index + 1).join(", ");
      items.push({ tone: "warn", text: t("chips.warnings.levels_not_payable", { levels }) });
    } else {
      items.push({ tone: "warn", text: t(`chips.warnings.${w.code}`, { ...w, color: label(w.color), defaultValue: w.code }) });
    }
  }
  if (!items.length) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((it, i) => (
        <div
          key={i}
          className="card"
          style={{
            margin: 0,
            padding: "10px 12px",
            borderColor: it.tone === "error" ? "rgba(255,76,106,0.7)" : "rgba(242,194,48,0.7)"
          }}
        >
          {it.text}
        </div>
      ))}
    </div>
  );
}

export function ChipsTab({
  settings,
  onSave,
  currencySymbol = "$",
  denomination = "cents"
}: {
  settings: Settings | null;
  onSave: (chips: ChipSettings) => Promise<void>;
  currencySymbol?: string;
  denomination?: Denomination;
}) {
  const { t } = useTranslation();
  const [colors, setColors] = useState<ChipColor[]>([]);
  const [draft, setDraft] = useState<ChipSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [plan, setPlan] = useState<ChipPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const seq = useRef(0);

  const saved = settings?.chips ?? null;

  useEffect(() => {
    let cancelled = false;
    apiGet<{ colors: ChipColor[]; defaults: ChipSettings }>("/api/chips/colors")
      .then((res) => {
        if (cancelled) return;
        setColors(res.colors);
        setDraft((prev) => prev ?? saved ?? res.defaults);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!saved || dirty) return;
    setDraft(saved);
  }, [saved, dirty]);

  // Re-plan as the config is edited, so the numbers track unsaved changes.
  useEffect(() => {
    if (!draft) return;
    const mine = ++seq.current;
    setPlanning(true);
    const handle = setTimeout(() => {
      apiPost<ChipPlan>("/api/chips/plan", draft)
        .then((res) => {
          if (seq.current !== mine) return;
          setPlan(res);
          setPlanError(null);
        })
        .catch((e) => {
          if (seq.current !== mine) return;
          setPlanError(String(e?.message ?? e));
        })
        .finally(() => {
          if (seq.current === mine) setPlanning(false);
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [draft]);

  const colorsById = useMemo(() => Object.fromEntries(colors.map((c) => [c.id, c])), [colors]);
  const sortedChips = useMemo(
    () => [...(draft?.chips ?? [])].sort((a, b) => a.denom_cents - b.denom_cents),
    [draft]
  );
  const usedColors = useMemo(() => new Set((draft?.chips ?? []).map((c) => c.color)), [draft]);
  const freeColors = useMemo(() => colors.filter((c) => !usedColors.has(c.id)), [colors, usedColors]);

  const update = (patch: Partial<ChipSettings>) => {
    setDirty(true);
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const addChip = () => {
    if (!freeColors.length) return;
    const pick = freeColors[Math.floor(Math.random() * freeColors.length)];
    const largest = (draft?.chips ?? []).reduce((m, c) => Math.max(m, c.denom_cents), 0);
    setDirty(true);
    setPicking(null);
    setDraft((prev) =>
      prev
        ? { ...prev, chips: [...prev.chips, { color: pick.id, denom_cents: largest ? largest * 5 : 10, qty: 100 }] }
        : prev
    );
  };

  const removeChip = (color: string) => {
    setDirty(true);
    setPicking((cur) => (cur === color ? null : cur));
    setDraft((prev) => (prev ? { ...prev, chips: prev.chips.filter((c) => c.color !== color) } : prev));
  };

  const recolorChip = (from: string, to: string) => {
    setPicking(null);
    if (from === to) return;
    setDirty(true);
    setDraft((prev) =>
      prev ? { ...prev, chips: prev.chips.map((c) => (c.color === from ? { ...c, color: to } : c)) } : prev
    );
  };

  const updateChip = (color: string, patch: Partial<ChipSpec>) => {
    setDirty(true);
    setDraft((prev) =>
      prev ? { ...prev, chips: prev.chips.map((c) => (c.color === color ? { ...c, ...patch } : c)) } : prev
    );
  };

  if (!draft) {
    return <div className="card" style={{ marginTop: 12 }}>{t("common.loading")}</div>;
  }

  const levels = settings?.levels ?? [];
  const usingOverride = draft.players_override !== null && draft.players_override !== undefined;

  return (
    <div className="row" style={{ marginTop: 12, display: "grid", gap: 12 }}>
      <div className="card">
        <h3>{t("chips.tourney.sectionTitle")}</h3>
        <div className="muted">{t("chips.tourney.helpText")}</div>
        <hr />

        <div style={{ display: "grid", gap: 12 }}>
          <div className="grid2">
            <div>
              <label>{t("chips.tourney.players")}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  style={{ width: 110 }}
                  disabled={!usingOverride}
                  value={usingOverride ? draft.players_override ?? 0 : plan?.registered_players ?? 0}
                  onChange={(e) => update({ players_override: Number(e.target.value) })}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={usingOverride}
                    onChange={(e) =>
                      update({ players_override: e.target.checked ? plan?.registered_players ?? 1 : null })
                    }
                  />
                  <span className="muted">{t("chips.tourney.overridePlayers")}</span>
                </label>
              </div>
              {!usingOverride ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {t("chips.tourney.fromTourney", { n: plan?.registered_players ?? 0 })}
                </div>
              ) : null}
            </div>

            <div>
              <label>{t("chips.tourney.maxRebuys")}</label>
              <input
                className="input"
                type="number"
                min={0}
                step={1}
                value={draft.max_rebuys}
                onChange={(e) => update({ max_rebuys: Math.max(0, Number(e.target.value)) })}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {t("chips.tourney.maxRebuysHelp")}
              </div>
            </div>
          </div>

          <div className="grid2">
            <div>
              <label>{t("chips.tourney.startingStack")}</label>
              <MoneyDisplay
                cents={draft.starting_stack_cents}
                editable
                size={18}
                currencySymbol={currencySymbol}
                denomination={denomination}
                onChange={(cents) => update({ starting_stack_cents: cents })}
              />
            </div>
            <div>
              <label>{t("chips.tourney.rebuyStack")}</label>
              <MoneyDisplay
                cents={draft.rebuy_stack_cents}
                editable
                disabled={draft.max_rebuys <= 0}
                size={18}
                currencySymbol={currencySymbol}
                denomination={denomination}
                onChange={(cents) => update({ rebuy_stack_cents: cents })}
              />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <input
              type="checkbox"
              checked={draft.color_ups}
              onChange={(e) => update({ color_ups: e.target.checked })}
            />
            <span>{t("chips.tourney.colorUps")}</span>
          </label>
        </div>
      </div>

      <div className="card">
        <h3>{t("chips.inventory.sectionTitle")}</h3>
        <div className="muted">{t("chips.inventory.helpText")}</div>
        <hr />
        {draft.chips.length === 0 ? (
          <div className="muted">{t("chips.inventory.empty")}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("chips.inventory.color")}</th>
                <th>{t("chips.inventory.denomination")}</th>
                <th>{t("chips.inventory.owned")}</th>
                <th>{t("chips.inventory.used")}</th>
                <th>{t("chips.inventory.remaining")}</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {sortedChips.map((chip) => {
                const color = colorsById[chip.color];
                const row = plan?.inventory?.find((r) => r.color === chip.color);
                const open = picking === chip.color;
                return (
                  <React.Fragment key={chip.color}>
                    <tr>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            className="btn"
                            title={t("chips.inventory.changeColor")}
                            aria-expanded={open}
                            style={{ padding: 4, lineHeight: 0, borderRadius: "50%" }}
                            onClick={() => setPicking(open ? null : chip.color)}
                          >
                            <ChipSwatch color={color} />
                          </button>
                          <span>{color?.label ?? chip.color}</span>
                        </div>
                      </td>
                      <td>
                        <MoneyDisplay
                          cents={chip.denom_cents}
                          editable
                          size={15}
                          currencySymbol={currencySymbol}
                          denomination={denomination}
                          onChange={(cents) => updateChip(chip.color, { denom_cents: cents })}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={1}
                          style={{ width: 90 }}
                          value={chip.qty}
                          onChange={(e) => updateChip(chip.color, { qty: Math.max(0, Number(e.target.value)) })}
                        />
                      </td>
                      <td>{row ? row.used : "\u2014"}</td>
                      <td style={{ color: row && row.remaining <= 0 ? "rgba(255,140,160,1)" : undefined }}>
                        {row ? row.remaining : "\u2014"}
                      </td>
                      <td>
                        <button
                          className="btn danger"
                          title={t("chips.inventory.removeChip")}
                          style={{ padding: "4px 8px", lineHeight: 0 }}
                          onClick={() => removeChip(chip.color)}
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={6} style={{ paddingTop: 0 }}>
                          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                            {t("chips.inventory.pickColor")}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {colors.map((c) => {
                              const taken = c.id !== chip.color && usedColors.has(c.id);
                              return (
                                <button
                                  key={c.id}
                                  className={"btn" + (c.id === chip.color ? " primary" : "")}
                                  disabled={taken}
                                  title={taken ? t("chips.inventory.colorTaken", { color: c.label }) : c.label}
                                  style={{
                                    padding: 6,
                                    lineHeight: 0,
                                    borderRadius: "50%",
                                    cursor: taken ? "not-allowed" : "pointer"
                                  }}
                                  onClick={() => recolorChip(chip.color, c.id)}
                                >
                                  <ChipSwatch color={c} size={30} struck={taken} />
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 10 }}>
          <button className="btn" disabled={freeColors.length === 0} onClick={addChip}>
            <Plus size={16} style={{ verticalAlign: "-3px", marginRight: 4 }} />
            {t("chips.inventory.addChip")}
          </button>
          {freeColors.length === 0 ? (
            <span className="muted" style={{ marginLeft: 8 }}>{t("chips.inventory.allColorsUsed")}</span>
          ) : null}
        </div>
        <hr />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn primary"
            disabled={!dirty}
            onClick={async () => {
              await onSave(draft);
              setDirty(false);
            }}
          >
            {t("chips.save")}
          </button>
          <button className="btn" disabled={!dirty || !saved} onClick={() => { setDraft(saved); setDirty(false); }}>
            {t("levels.actions.discard")}
          </button>
          {dirty ? <span className="muted" style={{ alignSelf: "center" }}>{t("chips.unsaved")}</span> : null}
        </div>
      </div>

      {planError ? (
        <div className="card" style={{ borderColor: "rgba(255,76,106,0.7)" }}>{planError}</div>
      ) : null}

      {plan ? <Notices plan={plan} colorsById={colorsById} /> : null}

      {plan?.ok ? (
        <>
          <StackCard
            title={t("chips.plan.startingTitle")}
            subtitle={t("chips.plan.startingSubtitle", { n: plan.players })}
            stack={plan.starting}
            perStackLabel={t("chips.plan.perBuyIn")}
            totalLabel={t("chips.plan.totalBuyIns", { n: plan.starting?.stacks ?? 0 })}
            colorsById={colorsById}
            currencySymbol={currencySymbol}
            denomination={denomination}
          />
          {plan.rebuy ? (
            <StackCard
              title={t("chips.plan.rebuyTitle")}
              subtitle={t("chips.plan.rebuySubtitle", { n: plan.max_rebuys })}
              stack={plan.rebuy}
              perStackLabel={t("chips.plan.perRebuy")}
              totalLabel={t("chips.plan.totalRebuys", { n: plan.rebuy.stacks })}
              colorsById={colorsById}
              currencySymbol={currencySymbol}
              denomination={denomination}
            />
          ) : (
            <div className="card">
              <h3 style={{ marginBottom: 2 }}>{t("chips.plan.rebuyTitle")}</h3>
              <div className="muted">{t("chips.plan.rebuysDisabled")}</div>
            </div>
          )}

          {draft.color_ups ? (
            <div className="card">
              <h3>{t("chips.colorUps.sectionTitle")}</h3>
              <div className="muted">{t("chips.colorUps.helpText")}</div>
              <hr />
              {plan.color_ups.length === 0 ? (
                <div className="muted">{t("chips.colorUps.none")}</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {plan.color_ups.map((step, i) => {
                    const from = plan.inventory.find((r) => r.denom_cents === step.retire_denom_cents);
                    const into = plan.inventory.find((r) => r.denom_cents === step.into_denom_cents);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span className="badge">
                          {t("chips.colorUps.atBreak", { level: step.after_level_index + 1 })}
                        </span>
                        <ChipSwatch color={colorsById[from?.color ?? ""]} />
                        <span>
                          {t("chips.colorUps.exchange", {
                            ratio: step.ratio,
                            from: colorsById[from?.color ?? ""]?.label ?? "",
                            into: colorsById[into?.color ?? ""]?.label ?? ""
                          })}
                        </span>
                        <ChipSwatch color={colorsById[into?.color ?? ""]} />
                        {step.reserve_needed > 0 ? (
                          <span className="muted" style={{ fontSize: 13 }}>
                            ({t("chips.colorUps.reserve", { n: step.reserve_needed })})
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  <div className="muted">
                    {t("chips.colorUps.endsWith", {
                      denoms: plan.denoms_in_play_at_end
                        .map((d) => plan.inventory.find((r) => r.denom_cents === d)?.color)
                        .filter(Boolean)
                        .map((c) => colorsById[c as string]?.label ?? c)
                        .join(", ")
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {planning ? <div className="muted">{t("chips.recalculating")}</div> : null}
      {levels.length === 0 ? <div className="muted">{t("chips.noLevels")}</div> : null}
    </div>
  );
}
