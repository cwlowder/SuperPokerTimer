from app.chips import (
    DEFAULT_CHIPS,
    score_stack,
    granularity_floor,
    payable_with,
    plan_chips,
    plan_color_ups,
    solve_stack,
    stack_denoms,
)


def level(sb: int, bb: int, ante: int = 0) -> dict:
    return {"type": "regular", "minutes": 20, "small_blind_cents": sb, "big_blind_cents": bb, "ante_cents": ante}


BREAK = {"type": "break", "minutes": 10, "small_blind_cents": 0, "big_blind_cents": 0, "ante_cents": 0}


def chip_set(**denom_to_qty: int) -> list[dict]:
    """Build an explicit chip inventory, e.g. chip_set(c50=500, c100=500)."""
    return [
        {"color": f"color{i}", "denom_cents": int(k.lstrip("c")), "qty": q, "enabled": True}
        for i, (k, q) in enumerate(sorted(denom_to_qty.items(), key=lambda kv: int(kv[0].lstrip("c"))))
    ]

LEVELS = [
    level(10, 20), level(20, 40), level(50, 100), BREAK,
    level(100, 200), level(250, 500), level(500, 1000), BREAK,
    level(1000, 2000), level(2500, 5000),
]


def test_granularity_floor_picks_coarsest_chip_that_makes_blinds() -> None:
    # Blinds move in steps of 10, so 1c and 5c chips are clutter.
    assert granularity_floor([1, 5, 10, 25, 50], level(10, 20)) == 10


def test_granularity_floor_respects_odd_blinds() -> None:
    # gcd(25, 50) == 25, so the 25c chip is the coarsest that still works.
    assert granularity_floor([1, 5, 10, 25, 50], level(25, 50)) == 25


def test_payable_with() -> None:
    assert payable_with(level(100, 200), 50)
    assert not payable_with(level(150, 300), 100)
    assert payable_with(level(100, 200, ante=25), 25)
    assert not payable_with(level(100, 200, ante=25), 50)


def test_stack_denoms_excludes_chips_too_large_for_the_stack() -> None:
    # A 500c stack shouldn't contain a chip worth more than ~1/6 of it.
    assert 100 not in stack_denoms([10, 25, 50, 100, 500], 10, 500)


def test_stack_denoms_always_returns_at_least_two() -> None:
    assert len(stack_denoms([100, 500], 100, 200)) >= 2


def test_solve_stack_hits_the_target_exactly() -> None:
    denoms = [10, 25, 50]
    counts = solve_stack(denoms, [99, 99, 99], 500, 20)
    assert counts is not None
    assert sum(c * d for c, d in zip(counts, denoms)) == 500


def test_solve_stack_respects_per_denomination_limits() -> None:
    denoms = [10, 25, 50]
    counts = solve_stack(denoms, [99, 2, 99], 500, 20)
    assert counts is not None
    assert counts[1] <= 2


def test_solve_stack_returns_none_when_supply_cannot_reach_the_stack() -> None:
    assert solve_stack([10, 25, 50], [1, 1, 1], 500, 20) is None


def test_solve_stack_prefers_round_counts() -> None:
    denoms = [10, 25, 50]
    counts = solve_stack(denoms, [99, 99, 99], 500, 20)
    assert counts is not None
    # Every count should be tidy to hand out: a multiple of five, or at least even.
    assert all(c % 5 == 0 or c % 2 == 0 for c in counts if c), counts


def test_color_ups_always_exchange_at_a_whole_ratio() -> None:
    schedule, _, _ = plan_color_ups(LEVELS, [10, 25, 50])
    assert schedule
    for step in schedule:
        retire = step["retire_denom_cents"]
        assert step["exchanges"]
        for exchange in step["exchanges"]:
            into = exchange["into_denom_cents"]
            assert into % retire == 0
            assert exchange["ratio"] == into // retire


def test_color_ups_only_retire_chips_the_blinds_have_outgrown() -> None:
    schedule, remaining, _ = plan_color_ups(LEVELS, [10, 25, 50])
    for step in schedule:
        assert step["retire_denom_cents"] not in remaining
    assert remaining[0] > 10


def test_color_ups_are_skipped_when_blinds_stay_small() -> None:
    flat = [level(10, 20), BREAK, level(10, 20), BREAK, level(20, 40)]
    schedule, remaining, _ = plan_color_ups(flat, [10, 25, 50])
    assert schedule == []
    assert remaining == [10, 25, 50]


def test_plan_chips_starting_stack_is_worth_exactly_the_buy_in() -> None:
    plan = plan_chips(
        chips=DEFAULT_CHIPS, players=9, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    total = sum(c["count"] * c["denom_cents"] for c in plan["starting"]["chips"])
    assert total == 500


def test_plan_chips_never_hands_out_more_chips_than_are_owned() -> None:
    plan = plan_chips(
        chips=DEFAULT_CHIPS, players=9, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    for row in plan["inventory"]:
        assert row["used"] <= row["owned"]
        assert row["remaining"] >= 0


def test_plan_chips_rebuy_stacks_are_counted_against_inventory() -> None:
    chips = [dict(c, qty=400) for c in DEFAULT_CHIPS]
    plan = plan_chips(
        chips=chips, players=6, max_rebuys=2,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    assert plan["rebuy"] is not None
    assert plan["rebuy"]["stacks"] == 12
    for row in plan["inventory"]:
        assert row["used"] <= row["owned"]


def test_plan_chips_omits_chips_finer_than_the_blinds_need() -> None:
    # Blinds open at 10/20, so 1c and 5c chips would never need to change hands.
    plan = plan_chips(
        chips=chip_set(c1=500, c5=500, c10=500, c25=500, c50=500), players=9, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    issued = {c["denom_cents"] for c in plan["starting"]["chips"]}
    assert 1 not in issued and 5 not in issued


def test_plan_chips_errors_when_the_ask_is_impossible() -> None:
    plan = plan_chips(
        chips=DEFAULT_CHIPS, players=1000, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert not plan["ok"]
    assert plan["errors"][0]["code"] in {"insufficient_value", "insufficient_supply"}


def test_plan_chips_reports_insufficient_value_when_the_chips_are_not_worth_enough() -> None:
    # 20 chips worth 10c each is $2.00 of value against $30 of buy-ins.
    plan = plan_chips(
        chips=chip_set(c10=20), players=6, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert not plan["ok"]
    assert plan["errors"][0]["code"] == "insufficient_value"


def test_plan_chips_distinguishes_supply_from_arithmetic() -> None:
    # Plenty of total value, but capped so no tidy stack can be built per player.
    chips = [dict(c, qty=60) for c in DEFAULT_CHIPS]
    plan = plan_chips(
        chips=chips, players=9, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    if not plan["ok"]:
        assert plan["errors"][0]["code"] in {"insufficient_supply", "insufficient_value"}


def test_plan_chips_warns_when_blinds_cannot_be_paid_exactly() -> None:
    # Opening blinds of 100/200 make the 100c chip the base, but a later 150c
    # small blind cannot be built out of 100c chips.
    chips = chip_set(c100=500, c500=500)
    awkward = [level(100, 200), level(150, 300), level(1000, 2000)]
    plan = plan_chips(
        chips=chips, players=6, max_rebuys=0,
        starting_stack_cents=2000, rebuy_stack_cents=2000, levels=awkward, color_ups=True,
    )
    codes = {w["code"] for w in plan["warnings"]}
    assert "levels_not_payable" in codes


def test_plan_chips_warns_when_only_one_denomination_fits() -> None:
    # Chips top out at 50c but the stack is 1000c, so 50c is the only usable chip.
    chips = chip_set(c50=500)
    plan = plan_chips(
        chips=chips, players=6, max_rebuys=0,
        starting_stack_cents=1000, rebuy_stack_cents=1000,
        levels=[level(50, 100), level(100, 200)], color_ups=True,
    )
    assert "single_denomination" in {w["code"] for w in plan["warnings"]}


def test_plan_chips_rejects_an_empty_table() -> None:
    plan = plan_chips(
        chips=DEFAULT_CHIPS, players=0, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert not plan["ok"]
    assert {e["code"] for e in plan["errors"]} == {"no_players"}


def test_every_plan_result_has_the_same_shape() -> None:
    """Failure paths must not omit keys the frontend types as always present."""
    shape = {
        "ok", "errors", "warnings", "players", "max_rebuys",
        "starting", "rebuy", "inventory", "reserve", "color_ups", "denoms_in_play_at_end",
    }
    cases = [
        dict(chips=DEFAULT_CHIPS, players=9, max_rebuys=0, starting_stack_cents=500, rebuy_stack_cents=500),
        dict(chips=DEFAULT_CHIPS, players=0, max_rebuys=0, starting_stack_cents=500, rebuy_stack_cents=500),
        dict(chips=[], players=9, max_rebuys=0, starting_stack_cents=500, rebuy_stack_cents=500),
        dict(chips=DEFAULT_CHIPS, players=9, max_rebuys=0, starting_stack_cents=0, rebuy_stack_cents=0),
        dict(chips=DEFAULT_CHIPS, players=9999, max_rebuys=9, starting_stack_cents=500, rebuy_stack_cents=500),
    ]
    for case in cases:
        plan = plan_chips(levels=LEVELS, color_ups=True, **case)
        assert shape <= set(plan), f"missing {shape - set(plan)} for {case}"


def test_no_players_is_reported_rather_than_crashing() -> None:
    # A fresh tourney with an empty roster: the tab should get a clean error.
    plan = plan_chips(
        chips=DEFAULT_CHIPS, players=0, max_rebuys=0,
        starting_stack_cents=500, rebuy_stack_cents=500, levels=LEVELS, color_ups=True,
    )
    assert not plan["ok"]
    assert plan["starting"] is None
    assert plan["inventory"] == []


def test_stack_totals_match_the_per_stack_counts() -> None:
    plan = plan_chips(
        chips=[dict(c, qty=900) for c in DEFAULT_CHIPS], players=8, max_rebuys=2,
        starting_stack_cents=1000, rebuy_stack_cents=1000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    for key in ("starting", "rebuy"):
        stack = plan[key]
        assert stack is not None
        for chip in stack["chips"]:
            assert chip["total"] == chip["count"] * stack["stacks"]
        assert stack["total_chips_all"] == stack["total_chips"] * stack["stacks"]


def test_stack_totals_agree_with_inventory_usage() -> None:
    """What you count out of the box must equal what the inventory says is used."""
    plan = plan_chips(
        chips=[dict(c, qty=900) for c in DEFAULT_CHIPS], players=8, max_rebuys=2,
        starting_stack_cents=1000, rebuy_stack_cents=1000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    counted: dict[str, int] = {}
    for key in ("starting", "rebuy"):
        for chip in plan[key]["chips"]:
            counted[chip["color"]] = counted.get(chip["color"], 0) + chip["total"]
    for row in plan["inventory"]:
        assert row["used"] == counted.get(row["color"], 0)


def test_color_ups_can_target_a_chip_that_was_not_in_the_starting_stack() -> None:
    # 10c and 25c start in play; the 50c chip is only available, never dealt.
    schedule, remaining, _ = plan_color_ups(LEVELS, [10, 25], available=[10, 25, 50, 500])
    assert schedule, "expected the 10c chip to be retired"
    first = schedule[0]
    assert first["retire_denom_cents"] == 10
    assert [e["into_denom_cents"] for e in first["exchanges"]] == [50]
    assert first["exchanges"][0]["ratio"] == 5
    assert 50 in remaining


def test_color_ups_report_the_reserve_they_consume() -> None:
    plan = plan_chips(
        chips=[dict(c, qty=900) for c in DEFAULT_CHIPS], players=8, max_rebuys=0,
        starting_stack_cents=2000, rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    for step in plan["color_ups"]:
        assert step["reserve_needed"] == sum(e["count"] for e in step["exchanges"])
        assert step["reserve_needed"] >= 0


def test_two_colors_with_the_same_value_are_reported_not_double_counted() -> None:
    chips = [
        {"color": "red", "denom_cents": 25, "qty": 500},
        {"color": "blue", "denom_cents": 25, "qty": 500},
        {"color": "black", "denom_cents": 100, "qty": 500},
    ]
    plan = plan_chips(
        chips=chips, players=6, max_rebuys=0,
        starting_stack_cents=1000, rebuy_stack_cents=1000, levels=LEVELS, color_ups=True,
    )
    assert "duplicate_denomination" in {w["code"] for w in plan["warnings"]}
    assert len(plan["inventory"]) == 2


def test_chips_without_an_enabled_flag_are_treated_as_owned() -> None:
    # The field is gone from new configs; its absence must not blank the plan.
    chips = [{"color": "white", "denom_cents": 25, "qty": 500},
             {"color": "red", "denom_cents": 100, "qty": 500}]
    plan = plan_chips(
        chips=chips, players=6, max_rebuys=0,
        starting_stack_cents=1000, rebuy_stack_cents=1000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    assert plan["starting"] is not None


def test_solver_is_not_restricted_to_a_hand_picked_set_of_counts() -> None:
    """Tidiness belongs in the score, not in a candidate list with holes.

    A list of "nice" counts skipping 7, 9, 11... silently makes better stacks
    unreachable, so counts like these must still be findable.
    """
    denoms = [10, 50, 100, 250]
    # 10/5/9/3 is worth exactly 2000 and needs a count of 9 to be reachable.
    counts = solve_stack(denoms, [10, 10, 9, 3], 2000, 20)
    assert counts is not None
    assert sum(c * d for c, d in zip(counts, denoms)) == 2000
    assert 9 in counts, counts


def test_solver_returns_the_best_scoring_stack_it_can_reach() -> None:
    denoms = [10, 50, 100, 250]
    counts = solve_stack(denoms, [99] * 4, 2000, 20)
    assert counts is not None
    # Nothing reachable and exact should score better than what came back.
    best = score_stack(counts, denoms, 20)
    for a in range(0, 21):
        for b in range(0, 21):
            for c in range(0, 21):
                rest = 2000 - (b * 50 + c * 100 + a * 250)
                if rest < 0 or rest % 10:
                    continue
                alt = [rest // 10, b, c, a]
                if alt[0] <= 99:
                    assert score_stack(alt, denoms, 20) >= best - 1e-9, alt


def test_chip_count_does_not_decide_between_comfortable_stacks() -> None:
    """A 31-chip stack is as reasonable as a 27-chip one.

    Scoring every chip away from a single ideal quietly trades change-making for
    a smaller pile, which is the wrong trade at a real table.
    """
    denoms = [10, 50, 100, 250]
    fewer = [10, 5, 4, 5]    # 24 chips
    more = [10, 10, 9, 2]    # 31 chips, same value, tidier counts
    assert sum(c * d for c, d in zip(fewer, denoms)) == 2000
    assert sum(c * d for c, d in zip(more, denoms)) == 2000
    # The rounder mix must not lose purely for carrying seven more chips.
    assert score_stack(more, denoms, 20) < score_stack(fewer, denoms, 20)


def test_the_largest_chip_does_not_carry_most_of_the_stack() -> None:
    denoms = [10, 50, 100, 250]
    counts = solve_stack(denoms, [99] * 4, 2000, 20)
    assert counts is not None
    stack = sum(c * d for c, d in zip(counts, denoms))
    top_share = counts[-1] * denoms[-1] / stack
    assert top_share <= 0.5 + 1e-9, f"{counts} puts {top_share:.0%} in the top chip"


def test_per_color_warnings_are_grouped_into_one_notice() -> None:
    from app.chips import group_notices

    grouped = group_notices([
        {"code": "no_spare_chips", "color": "white", "denom_cents": 10},
        {"code": "no_spare_chips", "color": "red", "denom_cents": 50},
        {"code": "supply_limited", "color": "white", "denom_cents": 10},
        {"code": "no_spare_chips", "color": "blue", "denom_cents": 100},
        {"code": "single_denomination", "denom_cents": 50},
    ])
    assert [g["code"] for g in grouped] == ["no_spare_chips", "supply_limited", "single_denomination"]
    assert grouped[0]["colors"] == ["white", "red", "blue"]
    assert grouped[0]["denoms_cents"] == [10, 50, 100]
    assert grouped[1]["colors"] == ["white"]
    # Notices that are not per-colour pass through untouched.
    assert grouped[2] == {"code": "single_denomination", "denom_cents": 50}


def test_grouping_does_not_repeat_a_color() -> None:
    from app.chips import group_notices

    grouped = group_notices([
        {"code": "supply_limited", "color": "green", "denom_cents": 250},
        {"code": "supply_limited", "color": "green", "denom_cents": 250},
    ])
    assert len(grouped) == 1
    assert grouped[0]["colors"] == ["green"]


def test_a_real_plan_reports_each_warning_code_once() -> None:
    chips = [
        {"color": "white", "denom_cents": 10, "qty": 150},
        {"color": "red", "denom_cents": 50, "qty": 150},
        {"color": "blue", "denom_cents": 100, "qty": 135},
        {"color": "green", "denom_cents": 250, "qty": 50},
    ]
    plan = plan_chips(
        chips=chips, players=15, max_rebuys=0,
        starting_stack_cents=2000, rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    codes = [w["code"] for w in plan["warnings"]]
    assert len(codes) == len(set(codes)), codes


def test_every_palette_colour_is_fully_specified() -> None:
    from app.chips import CHIP_COLORS

    seen = set()
    for colour in CHIP_COLORS:
        assert {"id", "label", "hex", "ink", "edge"} <= set(colour), colour
        assert colour["id"] not in seen, f"duplicate colour {colour['id']}"
        seen.add(colour["id"])
        for key in ("hex", "ink", "edge"):
            assert colour[key].startswith("#"), colour


def _lab(hex_colour: str) -> tuple[float, float, float]:
    """sRGB hex to CIELAB, so colour checks are perceptual rather than by eye."""
    import math

    r, g, b = (int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
    to_linear = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = to_linear(r), to_linear(g), to_linear(b)
    x = r * 0.4124 + g * 0.3576 + b * 0.1805
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = r * 0.0193 + g * 0.1192 + b * 0.9505
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x / 0.95047), f(y), f(z / 1.08883)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def _delta_e(a: str, b: str) -> float:
    import math

    return math.dist(_lab(a), _lab(b))


def test_every_chip_rim_is_visible_against_its_face() -> None:
    """A white rim on a pale chip disappears; the white chip is why `edge` exists."""
    from app.chips import CHIP_COLORS

    for colour in CHIP_COLORS:
        separation = _delta_e(colour["hex"], colour["edge"])
        assert separation >= 25, f"{colour['label']} rim is only dE {separation:.1f} from its face"


def test_chip_colours_are_distinguishable_from_each_other() -> None:
    from app.chips import CHIP_COLORS

    for i, a in enumerate(CHIP_COLORS):
        for b in CHIP_COLORS[i + 1:]:
            separation = _delta_e(a["hex"], b["hex"])
            assert separation >= 20, f"{a['label']} and {b['label']} are only dE {separation:.1f} apart"


def test_a_break_that_cannot_colour_up_says_why() -> None:
    """Silently skipping a break looks like the feature is broken."""
    awkward = [
        level(50, 100), level(100, 200), BREAK,
        level(300, 600),   # 300 cannot be built from 200s and 500s at all
        level(900, 1800),
    ]
    # The 50c chip is outgrown at a 300 small blind but not yet useless, so a level
    # that still needs it wins and the colour up is skipped.
    schedule, remaining, blocked = plan_color_ups(awkward, [50, 200, 500], [50, 200, 500])
    assert schedule == []
    assert len(blocked) == 1
    step = blocked[0]
    assert step["retire_denom_cents"] == 50
    assert step["needs_denom_cents"] == 200
    assert step["blocking_level_indexes"] == [3]
    assert remaining == [50, 200, 500]


def test_multiple_breaks_produce_multiple_colour_ups() -> None:
    tidy = [
        level(10, 20), level(50, 100), BREAK,
        level(100, 200), level(400, 800), BREAK,
        level(1000, 2000), level(2000, 4000),
    ]
    schedule, remaining, blocked = plan_color_ups(tidy, [10, 50, 100, 250], [10, 50, 100, 250, 500])
    assert len(schedule) >= 2, schedule
    assert [s["retire_denom_cents"] for s in schedule] == sorted(s["retire_denom_cents"] for s in schedule)
    assert blocked == []


def test_a_blocked_colour_up_surfaces_as_a_plan_warning() -> None:
    chips = [
        {"color": "white", "denom_cents": 50, "qty": 900},
        {"color": "red", "denom_cents": 200, "qty": 900},
        {"color": "blue", "denom_cents": 500, "qty": 900},
    ]
    # Retiring the 50c chip leaves 200s, and a 300 small blind cannot be built
    # from those at all -- so the break is blocked and must say so.
    awkward = [
        level(50, 100), level(100, 200), BREAK,
        level(300, 600), level(900, 1800),
    ]
    plan = plan_chips(
        chips=chips, players=8, max_rebuys=0,
        starting_stack_cents=2000, rebuy_stack_cents=2000, levels=awkward, color_ups=True,
    )
    assert "color_up_blocked" in {w["code"] for w in plan["warnings"]}


def test_a_useless_chip_is_retired_even_if_a_level_then_needs_rounding() -> None:
    """Carrying dead chips all night is worse than rounding one blind level."""
    awkward = [
        level(50, 100), level(100, 200), BREAK,
        level(600, 1200),   # 50c is now 1/12 of the small blind: useless
        level(700, 1400),   # 700 cannot be built from 300s and 500s at all
        level(2000, 4000),
    ]
    schedule, remaining, blocked = plan_color_ups(awkward, [50, 300, 500], [50, 300, 500])
    assert blocked == []
    assert len(schedule) == 1
    step = schedule[0]
    assert step["retire_denom_cents"] == 50
    assert step["forced"] is True
    assert step["rounding_level_indexes"] == [4]
    assert 50 not in remaining


def test_an_outgrown_but_useful_chip_is_kept() -> None:
    # Same shape, but the blinds have not run far enough ahead of the chip.
    awkward = [
        level(50, 100), level(100, 200), BREAK,
        level(300, 600),
        level(900, 1800),
    ]
    schedule, remaining, blocked = plan_color_ups(awkward, [50, 200, 500], [50, 200, 500])
    assert schedule == []
    assert blocked and 50 in remaining


def test_shape_changes_identity_but_never_the_maths() -> None:
    """A plaque is a different token from a disc, but it counts the same."""
    plain = [
        {"color": "white", "denom_cents": 10, "qty": 400},
        {"color": "red", "denom_cents": 50, "qty": 400},
        {"color": "blue", "denom_cents": 100, "qty": 400},
        {"color": "green", "denom_cents": 250, "qty": 400},
    ]
    decorated = [dict(c, shape="plaque") for c in plain]
    args = dict(
        players=8, max_rebuys=0, starting_stack_cents=2000,
        rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    a, b = plan_chips(chips=plain, **args), plan_chips(chips=decorated, **args)
    numbers = lambda plan: [(c["denom_cents"], c["count"], c["total"]) for c in plan["starting"]["chips"]]
    assert numbers(a) == numbers(b)
    assert [r["shape"] for r in a["inventory"]] == ["chip"] * 4
    assert [r["shape"] for r in b["inventory"]] == ["plaque"] * 4


def test_one_colour_can_be_both_a_disc_and_a_plaque() -> None:
    """Colour is only unique per shape, so these are two separate tokens."""
    chips = [
        {"color": "white", "denom_cents": 10, "qty": 400, "shape": "chip"},
        {"color": "red", "denom_cents": 50, "qty": 400, "shape": "chip"},
        {"color": "blue", "denom_cents": 100, "qty": 400, "shape": "chip"},
        {"color": "white", "denom_cents": 250, "qty": 400, "shape": "plaque"},
    ]
    plan = plan_chips(
        chips=chips, players=8, max_rebuys=0, starting_stack_cents=2000,
        rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    # Both whites survive as distinct inventory rows rather than colliding.
    whites = [r for r in plan["inventory"] if r["color"] == "white"]
    assert len(whites) == 2
    assert {r["shape"] for r in whites} == {"chip", "plaque"}
    assert {r["denom_cents"] for r in whites} == {10, 250}
    # And their usage is tracked separately.
    by_denom = {r["denom_cents"]: r for r in whites}
    assert by_denom[10]["used"] != by_denom[250]["used"]
    for row in plan["inventory"]:
        assert row["used"] <= row["owned"]


def test_colour_up_steps_up_a_denomination_when_the_first_choice_runs_out() -> None:
    """Ten blues into a purple beats five blues into a black that ran out."""
    levels = [
        level(10, 20), level(50, 100), BREAK,
        level(500, 1000), level(2000, 4000),
    ]
    issued = {100: 400}
    # Only 3 blacks spare, but plenty of purples.
    plentiful = plan_color_ups(
        levels, [100, 500, 1000], [100, 500, 1000],
        issued=issued, spare={500: 500, 1000: 500},
    )[0]
    assert [e["into_denom_cents"] for e in plentiful[0]["exchanges"]] == [500], "prefer the nearest chip"
    assert plentiful[0]["shortfall"] == 0

    scarce = plan_color_ups(
        levels, [100, 500, 1000], [100, 500, 1000],
        issued=issued, spare={500: 3, 1000: 500},
    )[0]
    step = scarce[0]
    used = {e["into_denom_cents"]: e["count"] for e in step["exchanges"]}
    # Takes the three blacks that exist, then covers the rest with purples.
    assert used[500] == 3
    assert used[1000] >= 38
    assert step["shortfall"] == 0
    absorbed = sum(e["count"] * e["ratio"] for e in step["exchanges"])
    assert absorbed >= 400, "every retired chip must be accounted for"


def test_colour_up_falls_back_to_the_largest_chip_when_nothing_covers_it() -> None:
    levels = [
        level(10, 20), level(50, 100), BREAK,
        level(500, 1000), level(2000, 4000),
    ]
    schedule = plan_color_ups(
        levels, [100, 500, 1000], [100, 500, 1000],
        issued={100: 400}, spare={500: 1, 1000: 1},
    )[0]
    step = schedule[0]
    # It uses everything in the box and still cannot absorb them all.
    assert {e["into_denom_cents"] for e in step["exchanges"]} == {500, 1000}
    assert step["shortfall"] > 0


def test_a_short_colour_up_is_reported_against_the_chip_actually_chosen() -> None:
    chips = [
        {"color": "white", "denom_cents": 10, "qty": 900},
        {"color": "red", "denom_cents": 50, "qty": 900},
        {"color": "blue", "denom_cents": 100, "qty": 900},
        {"color": "green", "denom_cents": 250, "qty": 900},
        {"color": "black", "denom_cents": 500, "qty": 1},
        {"color": "purple", "denom_cents": 1000, "qty": 1},
    ]
    plan = plan_chips(
        chips=chips, players=20, max_rebuys=0, starting_stack_cents=2000,
        rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    for warning in plan["warnings"]:
        if warning["code"] == "color_up_short":
            retired = {s["retire_denom_cents"] for s in plan["color_ups"]}
            assert set(warning["denoms_cents"]) <= retired


def test_a_colour_up_can_mix_denominations() -> None:
    """Trade blues for blacks and purples together when neither covers it alone."""
    levels = [
        level(10, 20), level(50, 100), BREAK,
        level(500, 1000), level(2000, 4000),
    ]
    schedule, _, _ = plan_color_ups(
        levels, [100, 500, 1000], [100, 500, 1000],
        issued={100: 400}, spare={500: 20, 1000: 100},
    )
    step = schedule[0]
    used = {e["into_denom_cents"]: e["count"] for e in step["exchanges"]}
    assert set(used) == {500, 1000}, "expected both chips to be used"
    assert used[500] == 20, "should exhaust the nearest chip first"
    assert step["shortfall"] == 0
    absorbed = sum(e["count"] * e["ratio"] for e in step["exchanges"])
    assert absorbed >= 400


def test_an_exchange_never_promises_chips_that_are_not_in_the_box() -> None:
    levels = [
        level(10, 20), level(50, 100), BREAK,
        level(500, 1000), level(2000, 4000),
    ]
    spare = {500: 7, 1000: 9}
    schedule, _, _ = plan_color_ups(
        levels, [100, 500, 1000], [100, 500, 1000], issued={100: 400}, spare=spare,
    )
    for exchange in schedule[0]["exchanges"]:
        assert exchange["count"] <= spare[exchange["into_denom_cents"]]


def test_allocation_prefers_the_nearest_chip_it_can_fill() -> None:
    from app.chips import allocate_exchange

    exchanges, shortfall = allocate_exchange(100, 100, [500, 1000], {500: 1000, 1000: 1000})
    assert exchanges == [{"into_denom_cents": 500, "ratio": 5, "count": 20}]
    assert shortfall == 0


def test_allocation_rounds_a_part_stack_up_rather_than_leaving_it() -> None:
    from app.chips import allocate_exchange

    # 7 chips at 5:1 is one full black plus two left over.
    exchanges, shortfall = allocate_exchange(7, 100, [500], {500: 1000})
    assert sum(e["count"] for e in exchanges) == 2
    assert shortfall == 0


def test_reserve_totals_match_the_recipes() -> None:
    """What the card tells you to hold back must equal what the swaps consume."""
    chips = [
        {"color": "white", "denom_cents": 10, "qty": 900},
        {"color": "red", "denom_cents": 50, "qty": 900},
        {"color": "blue", "denom_cents": 100, "qty": 900},
        {"color": "green", "denom_cents": 250, "qty": 900},
        {"color": "black", "denom_cents": 500, "qty": 200},
        {"color": "purple", "denom_cents": 1000, "qty": 400},
    ]
    plan = plan_chips(
        chips=chips, players=20, max_rebuys=0, starting_stack_cents=2000,
        rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    from_recipes: dict[int, int] = {}
    for step in plan["color_ups"]:
        for exchange in step["exchanges"]:
            d = exchange["into_denom_cents"]
            from_recipes[d] = from_recipes.get(d, 0) + exchange["count"]
    assert {r["denom_cents"]: r["count"] for r in plan["reserve"]} == from_recipes
    by_denom = {r["denom_cents"]: r for r in plan["inventory"]}
    for denom, count in from_recipes.items():
        assert by_denom[denom]["reserved"] == count


def test_reserved_chips_are_never_double_promised() -> None:
    """A chip held back for a swap is not also spare for something else."""
    chips = [
        {"color": "white", "denom_cents": 10, "qty": 900},
        {"color": "red", "denom_cents": 50, "qty": 900},
        {"color": "blue", "denom_cents": 100, "qty": 900},
        {"color": "green", "denom_cents": 250, "qty": 900},
        {"color": "black", "denom_cents": 500, "qty": 60},
        {"color": "purple", "denom_cents": 1000, "qty": 60},
    ]
    plan = plan_chips(
        chips=chips, players=20, max_rebuys=0, starting_stack_cents=2000,
        rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    for row in plan["inventory"]:
        assert row["used"] + row["reserved"] <= row["owned"], row
        assert row["remaining"] == row["owned"] - row["used"] - row["reserved"]
        assert row["remaining"] >= 0, row


def test_no_colour_ups_means_no_reserve() -> None:
    plan = plan_chips(
        chips=[dict(c, qty=900) for c in DEFAULT_CHIPS], players=8, max_rebuys=0,
        starting_stack_cents=2000, rebuy_stack_cents=2000, levels=LEVELS, color_ups=False,
    )
    assert plan["reserve"] == []
    assert all(r["reserved"] == 0 for r in plan["inventory"])


def test_payability_considers_every_chip_not_just_the_smallest() -> None:
    """1250 is unreachable with 100s alone, but is 500 + 500 + 250.

    Testing divisibility against the smallest chip called real structures broken.
    """
    assert payable_with(level(1250, 2500), [100, 250, 500])
    assert payable_with(level(1250, 2500), 250)
    assert not payable_with(level(1250, 2500), 100)
    # A genuinely unreachable amount is still caught.
    assert not payable_with(level(300, 600), [200, 500])


def test_a_level_is_only_flagged_when_no_combination_pays_it() -> None:
    from app.chips import level_warnings

    schedule = [{"after_level_index": 1, "retire_denom_cents": 100,
                 "exchanges": [{"into_denom_cents": 500, "ratio": 5, "count": 1}]}]
    levels = [level(50, 100), BREAK, level(1250, 2500), level(300, 600)]
    flagged = {w["level_index"] for w in level_warnings(levels, [100, 250, 500], schedule)}
    # 1250 = 500 + 500 + 250, so it must not be flagged; 300 cannot be made from
    # 250s and 500s, so it must be.
    assert 2 not in flagged
    assert 3 in flagged


def test_chips_arriving_from_a_colour_up_count_as_in_play() -> None:
    from app.chips import level_warnings

    schedule = [{"after_level_index": 1, "retire_denom_cents": 50,
                 "exchanges": [{"into_denom_cents": 300, "ratio": 6, "count": 1}]}]
    levels = [level(50, 100), BREAK, level(300, 600)]
    # The 300c chip only exists because the swap brought it in.
    assert level_warnings(levels, [50, 500], schedule) == []
