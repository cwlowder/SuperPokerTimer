import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";

import MoneyDisplay from "../MoneyDisplay";
import { apiGet, apiPost } from "../../utils/api";
import { ChipColor, ChipPlan, ChipSettings, ChipShape, ChipSpec, ChipStackPlan, Denomination, Settings } from "../../types";

const FALLBACK_SETTINGS: ChipSettings = {
  enabled: true,
  color_ups: true,
  players_override: null,
  max_rebuys: 0,
  starting_stack_cents: 500,
  rebuy_stack_cents: 500,
  chips: []
};

/**
 * A token in the tourney's own colours.
 *
 * `chip` is a dice-edge disc; `plaque` is the rectangular European style, drawn on
 * the diagonal so the two are never mistaken for one another at a glance.
 */
export function ChipSwatch({
  color,
  size = 26,
  struck = false,
  shape = "chip"
}: {
  color?: ChipColor;
  size?: number;
  struck?: boolean;
  shape?: ChipShape;
}) {
  const face = color?.hex ?? "#888";
  const rim = color?.edge ?? "#FFFFFF";
  const weight = Math.max(2, Math.round(size * 0.12));
  const outline = "0 0 0 1px rgba(255,255,255,0.3)";

  return (
    <span
      title={color?.label}
      style={{
        position: "relative",
        display: "inline-flex",
        flex: "0 0 auto",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size
      }}
    >
      {shape === "plaque" ? (
        <span
          style={{
            // Sized so the rotated corners still fit inside the same box as a disc.
            width: size * 0.86,
            height: size * 0.56,
            borderRadius: Math.max(2, Math.round(size * 0.1)),
            background: face,
            border: `${weight}px dashed ${rim}`,
            boxShadow: outline,
            transform: "rotate(45deg)",
            opacity: struck ? 0.55 : 1
          }}
        />
      ) : (
        <span
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: face,
            border: `${weight}px dashed ${rim}`,
            boxShadow: outline,
            opacity: struck ? 0.55 : 1
          }}
        />
      )}
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

/**
 * Name a token. A disc is just its colour; a plaque says so, because one colour
 * can now be both and "White" alone would be ambiguous.
 */
function tokenName(color: ChipColor | undefined, shape: ChipShape | undefined, plaqueWord: string): string {
  const base = color?.label ?? "";
  return shape === "plaque" ? `${base} ${plaqueWord}` : base;
}

function ChipCountPill({
  color,
  count,
  shape
}: {
  color?: ChipColor;
  count: number;
  shape?: ChipShape;
}) {
  const { t } = useTranslation();
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
      <ChipSwatch color={color} shape={shape} />
      <span style={{ fontSize: 20, fontWeight: 800 }}>{count}</span>
      <span>{tokenName(color, shape, t("chips.inventory.shape_plaque").toLowerCase())}</span>
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
            shape={c.shape}
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
            shape={c.shape}
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
  const { t, i18n } = useTranslation();
  const items: { tone: "error" | "warn"; text: string }[] = [];

  const plaqueWord = t("chips.inventory.shape_plaque").toLowerCase();
  const label = (id?: string) => (id ? colorsById[id]?.label ?? id : "");
  const tokenLabel = (id?: string, shape?: string) =>
    colorsById[id ?? ""] ? tokenName(colorsById[id ?? ""], shape as ChipShape, plaqueWord) : label(id);
  // "white, red and blue" rather than three separate notices.
  const listFormat = new Intl.ListFormat(i18n.language || "en", { style: "long", type: "conjunction" });
  const colorList = (ids?: string[], shapes?: string[]) =>
    listFormat.format((ids ?? []).map((id, i) => tokenLabel(id, shapes?.[i])));

  const render = (notice: any, tone: "error" | "warn") => {
    if (notice.code === "levels_not_payable") {
      const levels = (notice.levels ?? []).map((l: any) => l.level_index + 1).join(", ");
      return { tone, text: String(t("chips.warnings.levels_not_payable", { levels })) };
    }
    if (notice.code === "color_up_blocked") {
      const items = notice.items ?? [];
      const breaks = items.map((it: any) => it.after_level_index).join(", ");
      const levels = Array.from(
        new Set(items.flatMap((it: any) => it.blocking_level_indexes ?? []))
      )
        .map((i: any) => i + 1)
        .join(", ");
      return { tone, text: String(t("chips.warnings.color_up_blocked", { breaks, levels })) };
    }
    const colors = notice.colors
      ? colorList(notice.colors, notice.shapes)
      : tokenLabel(notice.color, notice.shape);
    const count = notice.colors ? notice.colors.length : notice.color ? 1 : 0;
    return {
      tone,
      text: String(
        t(`chips.${tone === "error" ? "errors" : "warnings"}.${notice.code}`, {
          ...notice,
          colors,
          color: colors,
          n: count,
          defaultValue: notice.code
        })
      )
    };
  };

  for (const e of plan.errors) items.push(render(e, "error"));
  for (const w of plan.warnings) items.push(render(w, "warn"));
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
  const [picking, setPicking] = useState<number | null>(null);
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
  // Sorted for display, but each row remembers where it lives in the draft --
  // colour is no longer a unique handle now that a colour can be both shapes.
  const sortedChips = useMemo(
    () =>
      (draft?.chips ?? [])
        .map((chip, index) => ({ chip, index }))
        .sort((a, b) => a.chip.denom_cents - b.chip.denom_cents),
    [draft]
  );
  const takenByShape = useMemo(() => {
    const out: Record<ChipShape, Set<string>> = { chip: new Set(), plaque: new Set() };
    for (const c of draft?.chips ?? []) out[c.shape ?? "chip"].add(c.color);
    return out;
  }, [draft]);
  const freeSlots = useMemo(
    () =>
      (["chip", "plaque"] as ChipShape[]).flatMap((shape) =>
        colors.filter((c) => !takenByShape[shape].has(c.id)).map((c) => ({ color: c.id, shape }))
      ),
    [colors, takenByShape]
  );

  const update = (patch: Partial<ChipSettings>) => {
    setDirty(true);
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const addChip = () => {
    if (!freeSlots.length) return;
    // Prefer a plain disc; only reach for a plaque colour when discs are exhausted.
    const discs = freeSlots.filter((slot) => slot.shape === "chip");
    const pool = discs.length ? discs : freeSlots;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const largest = (draft?.chips ?? []).reduce((m, c) => Math.max(m, c.denom_cents), 0);
    setDirty(true);
    setPicking(null);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            chips: [
              ...prev.chips,
              { color: pick.color, shape: pick.shape, denom_cents: largest ? largest * 5 : 10, qty: 100 }
            ]
          }
        : prev
    );
  };

  const removeChip = (index: number) => {
    setDirty(true);
    setPicking(null);
    setDraft((prev) => (prev ? { ...prev, chips: prev.chips.filter((_, i) => i !== index) } : prev));
  };

  const updateChip = (index: number, patch: Partial<ChipSpec>) => {
    setDirty(true);
    setDraft((prev) =>
      prev ? { ...prev, chips: prev.chips.map((c, i) => (i === index ? { ...c, ...patch } : c)) } : prev
    );
  };

  const recolorChip = (index: number, to: string) => {
    setPicking(null);
    updateChip(index, { color: to });
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
                <th>{t("chips.inventory.reserved")}</th>
                <th>{t("chips.inventory.remaining")}</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {sortedChips.map(({ chip, index }) => {
                const shape: ChipShape = chip.shape ?? "chip";
                const color = colorsById[chip.color];
                const row = plan?.inventory?.find(
                  (r) => r.color === chip.color && (r.shape ?? "chip") === shape
                );
                const open = picking === index;
                return (
                  <React.Fragment key={index}>
                    <tr>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            className="btn"
                            title={t("chips.inventory.changeColor")}
                            aria-expanded={open}
                            style={{ padding: 4, lineHeight: 0, borderRadius: "50%" }}
                            onClick={() => setPicking(open ? null : index)}
                          >
                            <ChipSwatch color={color} shape={shape} />
                          </button>
                          <span>
                            {tokenName(color, shape, t("chips.inventory.shape_plaque").toLowerCase())}
                          </span>
                        </div>
                      </td>
                      <td>
                        <MoneyDisplay
                          cents={chip.denom_cents}
                          editable
                          size={15}
                          currencySymbol={currencySymbol}
                          denomination={denomination}
                          onChange={(cents) => updateChip(index, { denom_cents: cents })}
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
                          onChange={(e) => updateChip(index, { qty: Math.max(0, Number(e.target.value)) })}
                        />
                      </td>
                      <td>{row ? row.used : "\u2014"}</td>
                      <td>{row ? row.reserved : "\u2014"}</td>
                      <td style={{ color: row && row.remaining <= 0 ? "rgba(255,140,160,1)" : undefined }}>
                        {row ? row.remaining : "\u2014"}
                      </td>
                      <td>
                        <button
                          className="btn danger"
                          title={t("chips.inventory.removeChip")}
                          style={{ padding: "4px 8px", lineHeight: 0 }}
                          onClick={() => removeChip(index)}
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={7} style={{ paddingTop: 0 }}>
                          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                            {t("chips.inventory.pickColor")}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {colors.map((c) => {
                              // Only a clash within the same shape matters now.
                              const taken = c.id !== chip.color && takenByShape[shape].has(c.id);
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
                                  onClick={() => recolorChip(index, c.id)}
                                >
                                  <ChipSwatch color={c} size={30} struck={taken} shape={shape} />
                                </button>
                              );
                            })}
                          </div>

                          <div className="muted" style={{ fontSize: 13, margin: "12px 0 6px" }}>
                            {t("chips.inventory.shape")}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {(["chip", "plaque"] as const).map((option) => (
                              <button
                                key={option}
                                className={"btn" + (shape === option ? " primary" : "")}
                                disabled={option !== shape && takenByShape[option].has(chip.color)}
                                title={
                                  option !== shape && takenByShape[option].has(chip.color)
                                    ? t("chips.inventory.shapeTaken", { color: color?.label ?? chip.color })
                                    : undefined
                                }
                                style={{ display: "flex", alignItems: "center", gap: 8 }}
                                onClick={() => updateChip(index, { shape: option })}
                              >
                                <ChipSwatch color={color} size={22} shape={option} />
                                {t(`chips.inventory.shape_${option}`)}
                              </button>
                            ))}
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
          <button className="btn" disabled={freeSlots.length === 0} onClick={addChip}>
            <Plus size={16} style={{ verticalAlign: "-3px", marginRight: 4 }} />
            {t("chips.inventory.addChip")}
          </button>
          {freeSlots.length === 0 ? (
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
                    const plaqueWord = t("chips.inventory.shape_plaque").toLowerCase();
                    const fromLabel = tokenName(colorsById[from?.color ?? ""], from?.shape, plaqueWord);
                    return (
                      <div key={i} style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span className="badge">
                            {t("chips.colorUps.atBreak", { level: step.after_level_index + 1 })}
                          </span>
                          <span>{t("chips.colorUps.retire", { color: fromLabel })}</span>
                          {step.forced ? (
                            <span className="badge" style={{ borderColor: "rgba(242,194,48,0.7)" }}>
                              {t("chips.colorUps.rounds", {
                                levels: (step.rounding_level_indexes ?? []).map((n) => n + 1).join(", ")
                              })}
                            </span>
                          ) : null}
                        </div>

                        {/* Just the recipes: how many of the old chip make one of the new. */}
                        <div style={{ display: "grid", gap: 4, paddingLeft: 8 }}>
                          {step.exchanges.map((exchange) => {
                            const into = plan.inventory.find(
                              (r) => r.denom_cents === exchange.into_denom_cents
                            );
                            return (
                              <div
                                key={exchange.into_denom_cents}
                                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                              >
                                <span style={{ fontSize: 18, fontWeight: 800 }}>{exchange.ratio}</span>
                                <ChipSwatch color={colorsById[from?.color ?? ""]} shape={from?.shape} size={22} />
                                <span>{fromLabel}</span>
                                <span className="muted" style={{ margin: "0 4px" }}>=</span>
                                <span style={{ fontSize: 18, fontWeight: 800 }}>1</span>
                                <ChipSwatch color={colorsById[into?.color ?? ""]} shape={into?.shape} size={22} />
                                <span>{tokenName(colorsById[into?.color ?? ""], into?.shape, plaqueWord)}</span>
                                <span className="muted" style={{ fontSize: 13 }}>
                                  {t("chips.colorUps.onHand", {
                                    n: exchange.count,
                                    color: tokenName(colorsById[into?.color ?? ""], into?.shape, plaqueWord)
                                  })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {plan.reserve.length ? (
                    <>
                      <hr />
                      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                        {t("chips.colorUps.reserveTitle")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {plan.reserve.map((r) => (
                          <ChipCountPill
                            key={`${r.color}-${r.shape}-${r.denom_cents}`}
                            color={colorsById[r.color]}
                            count={r.count}
                            shape={r.shape}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}

                  <div className="muted">
                    {t("chips.colorUps.endsWith", {
                      denoms: plan.denoms_in_play_at_end
                        .map((d) => plan.inventory.find((r) => r.denom_cents === d))
                        .filter(Boolean)
                        .map((r) =>
                          tokenName(
                            colorsById[r!.color],
                            r!.shape,
                            t("chips.inventory.shape_plaque").toLowerCase()
                          )
                        )
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
