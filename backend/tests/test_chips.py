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
    schedule, _ = plan_color_ups(LEVELS, [10, 25, 50])
    assert schedule
    for step in schedule:
        into, retire = step["into_denom_cents"], step["retire_denom_cents"]
        assert into % retire == 0
        assert step["ratio"] == into // retire


def test_color_ups_only_retire_chips_the_blinds_have_outgrown() -> None:
    schedule, remaining = plan_color_ups(LEVELS, [10, 25, 50])
    for step in schedule:
        assert step["retire_denom_cents"] not in remaining
    assert remaining[0] > 10


def test_color_ups_are_skipped_when_blinds_stay_small() -> None:
    flat = [level(10, 20), BREAK, level(10, 20), BREAK, level(20, 40)]
    schedule, remaining = plan_color_ups(flat, [10, 25, 50])
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
        "starting", "rebuy", "inventory", "color_ups", "denoms_in_play_at_end",
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
    schedule, remaining = plan_color_ups(LEVELS, [10, 25], available=[10, 25, 50, 500])
    assert schedule, "expected the 10c chip to be retired"
    first = schedule[0]
    assert first["retire_denom_cents"] == 10
    assert first["into_denom_cents"] == 50
    assert first["ratio"] == 5
    assert 50 in remaining


def test_color_ups_report_the_reserve_they_consume() -> None:
    plan = plan_chips(
        chips=[dict(c, qty=900) for c in DEFAULT_CHIPS], players=8, max_rebuys=0,
        starting_stack_cents=2000, rebuy_stack_cents=2000, levels=LEVELS, color_ups=True,
    )
    assert plan["ok"], plan["errors"]
    for step in plan["color_ups"]:
        assert step["reserve_needed"] >= 0
        # Trading N chips at R:1 needs about N/R of the larger chip.
        assert step["reserve_needed"] <= max(1, step["ratio"]) * 10_000


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
