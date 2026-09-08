"""Chip denomination planning: how many chips of each color each player needs.

Pure functions (no DB, no async) so the heuristics stay unit-testable, like seating.py.
All money values are cents, matching the rest of the app.
"""
from math import gcd
from typing import Any

# The 10 standard dice-edge chip colors, ordered by conventional value.
CHIP_COLORS: list[dict[str, str]] = [
    {"id": "white",  "label": "White",  "hex": "#F4F1EA", "ink": "#1B1B1B"},
    {"id": "red",    "label": "Red",    "hex": "#C8102E", "ink": "#FFFFFF"},
    {"id": "blue",   "label": "Blue",   "hex": "#1F5FBF", "ink": "#FFFFFF"},
    {"id": "green",  "label": "Green",  "hex": "#1E7A3C", "ink": "#FFFFFF"},
    {"id": "black",  "label": "Black",  "hex": "#1B1B1B", "ink": "#FFFFFF"},
    {"id": "purple", "label": "Purple", "hex": "#6B3FA0", "ink": "#FFFFFF"},
    {"id": "gray",   "label": "Gray",   "hex": "#8A8F98", "ink": "#1B1B1B"},
    {"id": "yellow", "label": "Yellow", "hex": "#F2C230", "ink": "#1B1B1B"},
    {"id": "pink",   "label": "Pink",   "hex": "#E56AA0", "ink": "#1B1B1B"},
    {"id": "orange", "label": "Orange", "hex": "#E8722C", "ink": "#1B1B1B"},
]

COLOR_LABELS = {c["id"]: c["label"] for c in CHIP_COLORS}

DEFAULT_CHIPS: list[dict[str, Any]] = [
    {"color": "white",  "denom_cents": 10,    "qty": 100},
    {"color": "red",    "denom_cents": 50,    "qty": 100},
    {"color": "blue",   "denom_cents": 100,   "qty": 100},
    {"color": "green",  "denom_cents": 250,   "qty": 100},
    {"color": "black",  "denom_cents": 500,   "qty": 100},
    {"color": "purple", "denom_cents": 1000,  "qty": 100},
]

DEFAULT_CHIP_SETTINGS: dict[str, Any] = {
    "enabled": True,
    "color_ups": True,
    "players_override": None,
    "max_rebuys": 0,
    "starting_stack_cents": 2000,
    "rebuy_stack_cents": 2000,
    "chips": DEFAULT_CHIPS,
}

# Any stack in this range is a comfortable handful, so chip count alone should not
# decide between them -- let tidiness and the mix do that. Penalising every chip
# away from a single ideal quietly trades away change-making for a smaller pile.
COMFORTABLE_STACK_CHIPS = (20, 34)
MAX_STACK_CHIPS = 60
# More than this many of one colour is a nuisance to count out and to stack.
MAX_PER_DENOM = 12
# Every denomination dealt should be worth carrying: at least this share of the stack.
MIN_VALUE_SHARE = 0.05
# If the biggest chip carries most of the stack, players must break it to make any
# ordinary bet -- exactly the fiddling this is meant to avoid.
MAX_TOP_SHARE = 0.5
SEARCH_BUDGET = 200_000
# A stack never sensibly holds more than this many of one non-base denomination.
# This bounds the branching factor; unlike a hand-picked list of "nice" counts it
# has no holes, so every plausible count is still reachable.
SEARCH_MAX_PER_DENOM = 40


def is_break(level: dict[str, Any]) -> bool:
    return (level.get("type") or "regular") == "break"


def regular_levels(levels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [l for l in levels if not is_break(l)]


def level_amounts(level: dict[str, Any]) -> list[int]:
    """The amounts a player must be able to put in front of them at this level."""
    out = []
    for key in ("small_blind_cents", "big_blind_cents", "ante_cents"):
        v = int(level.get(key) or 0)
        if v > 0:
            out.append(v)
    return out


def payable_with(level: dict[str, Any], denom: int) -> bool:
    """Can every blind/ante at this level be made exactly from chips of `denom` or larger?"""
    if denom <= 0:
        return False
    return all(a % denom == 0 for a in level_amounts(level))


def blind_unit(level: dict[str, Any]) -> int:
    """Largest amount that divides every blind/ante at this level."""
    unit = 0
    for a in level_amounts(level):
        unit = gcd(unit, a)
    return unit


def granularity_floor(denoms: list[int], level: dict[str, Any] | None) -> int:
    """Coarsest chip that can still make the opening blinds exactly.

    Anything smaller is clutter: if blinds move in steps of 10, a 1-cent chip
    never needs to change hands.
    """
    if not denoms:
        return 0
    if level is None:
        return denoms[0]
    unit = blind_unit(level)
    if unit <= 0:
        return denoms[0]
    fits = [d for d in denoms if unit % d == 0]
    return max(fits) if fits else denoms[0]


def stack_denoms(denoms: list[int], floor: int, stack_cents: int) -> list[int]:
    """Which denominations belong in a stack of this size.

    Floored so we don't hand out chips finer than the blinds need, capped so no
    single chip is a huge slice of the stack, and width-limited to keep the mix
    readable at the table.
    """
    pool = [d for d in denoms if d >= floor] or list(denoms)
    ceiling = max(stack_cents // 6, floor)
    kept = [d for d in pool if d <= ceiling]
    if len(kept) < 2:
        kept = pool[:2]
    if len(kept) > 5:
        # Keep the base chip plus the largest few; the middle adds little.
        kept = [kept[0]] + kept[-4:]
    return kept


def denom_candidates(denoms: list[int], floor: int, stack_cents: int) -> list[list[int]]:
    """Denomination sets to try, most preferred first.

    The size ceiling in stack_denoms is a preference, not a rule. When chips are
    scarce the smaller denominations may not be able to reach the stack value at
    all, and a larger chip in the stack beats having no plan.
    """
    pool = [d for d in denoms if d >= floor] or list(denoms)
    base = stack_denoms(denoms, floor, stack_cents)
    out = [base]
    larger = [d for d in pool if d > max(base)]
    for i in range(len(larger)):
        out.append(sorted(set(base + larger[: i + 1])))
    return out


def score_stack(counts: list[int], denoms: list[int], big_blind: int) -> float:
    """Lower is better. Encodes the 'easy for humans at a real table' goals."""
    total = sum(counts)
    stack = sum(c * d for c, d in zip(counts, denoms))
    low, high = COMFORTABLE_STACK_CHIPS
    cost = 0.0
    if total < low:
        cost += (low - total) * 1.2
    elif total > high:
        cost += (total - high) * 1.2
    if total > MAX_STACK_CHIPS:
        cost += (total - MAX_STACK_CHIPS) * 5.0

    for c in counts:
        # Round counts are easier to verify by eye: 5 tens beats 7 tens.
        if c == 0:
            cost += 7.0
        elif c == 1:
            cost += 3.5
        elif c % 5 == 0:
            pass
        elif c % 2 == 0 and c <= 20:
            cost += 2.0
        else:
            cost += 4.0
        # A towering pile of one colour is slow to count and awkward to bet with.
        if c > MAX_PER_DENOM:
            cost += (c - MAX_PER_DENOM) * 2.5

    if stack > 0:
        for c, d in zip(counts, denoms):
            share = c * d / stack
            # A denomination holding a sliver of the stack is just clutter.
            if 0 < share < MIN_VALUE_SHARE:
                cost += (MIN_VALUE_SHARE - share) * 60.0
        top_share = counts[-1] * denoms[-1] / stack
        if top_share > MAX_TOP_SHARE:
            cost += (top_share - MAX_TOP_SHARE) * 40.0

    if big_blind > 0:
        # Enough small change to post blinds for a few orbits without breaking a
        # big chip -- a few big blinds' worth, not a tenth of the stack.
        small_chips = sum(c for c, d in zip(counts, denoms) if d <= big_blind)
        small_value = sum(c * d for c, d in zip(counts, denoms) if d <= big_blind)
        want_value = 4 * big_blind
        if small_value < want_value:
            cost += (want_value - small_value) / big_blind * 4.0
        if small_chips < 4:
            cost += (4 - small_chips) * 3.0
    return cost


def solve_stack(denoms: list[int], limits: list[int], stack_cents: int, big_blind: int) -> list[int] | None:
    """Best set of chip counts worth exactly `stack_cents`.

    Every count is on the table; how tidy a mix looks is decided entirely by
    score_stack and never by restricting what the search may consider -- a
    hand-picked candidate list silently deletes good answers. The base chip
    absorbs the remainder, so a solution exists whenever it divides. Larger
    denominations are placed first, which collapses the search quickly.
    """
    if not denoms or stack_cents <= 0:
        return None
    base = denoms[0]
    higher = denoms[1:]
    n = len(higher)
    order = list(range(n))[::-1]
    chosen = [0] * n
    best: list[int] | None = None
    best_cost = float("inf")
    budget = SEARCH_BUDGET

    def rec(k: int, remaining: int) -> None:
        nonlocal best, best_cost, budget
        if budget <= 0:
            return
        budget -= 1
        if k == n:
            if remaining % base:
                return
            base_count = remaining // base
            if base_count > limits[0]:
                return
            counts = [base_count] + chosen
            cost = score_stack(counts, denoms, big_blind)
            if cost < best_cost:
                best, best_cost = counts[:], cost
            return
        i = order[k]
        d = higher[i]
        cap = min(limits[i + 1], remaining // d, SEARCH_MAX_PER_DENOM)
        for c in range(cap, -1, -1):
            chosen[i] = c
            rec(k + 1, remaining - c * d)
        chosen[i] = 0

    rec(0, stack_cents)
    return best


def plan_color_ups(
    levels: list[dict[str, Any]],
    denoms: list[int],
    available: list[int] | None = None,
) -> tuple[list[dict[str, Any]], list[int]]:
    """Retire the smallest chip at breaks once the blinds have outgrown it.

    `denoms` is what starts in play; `available` is every chip that could come
    into play, so a denomination too large for the starting stack can still be
    the target of a later colour up. At most one denomination per break, and only
    when every remaining level can still be paid exactly with the next chip up.
    """
    pool = sorted(set(available if available is not None else denoms))
    schedule: list[dict[str, Any]] = []
    in_play = list(denoms)
    for idx, level in enumerate(levels):
        if not is_break(level):
            continue
        future = regular_levels(levels[idx + 1:])
        if not future or len(in_play) < 2:
            continue
        low, nxt = in_play[0], in_play[1]
        next_sb = int(future[0].get("small_blind_cents") or 0)
        if next_sb <= 0:
            continue
        # Exchange into the smallest chip the retired one divides into, whether or
        # not it was part of the starting stack.
        target = next((d for d in pool if d > low and d % low == 0), None)
        if target is None:
            continue
        # Retire only when the chip has become small change and nothing later needs it.
        if low * 5 <= next_sb and all(payable_with(l, nxt) for l in future):
            schedule.append({
                "after_level_index": idx,
                "retire_denom_cents": low,
                "into_denom_cents": target,
                "ratio": target // low,
            })
            in_play = sorted(set(in_play[1:] + [target]))
    return schedule, in_play


def level_warnings(levels: list[dict[str, Any]], denoms: list[int], schedule: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag levels whose blinds can't be posted exactly with the chips in play."""
    retire_at = {s["after_level_index"]: s["retire_denom_cents"] for s in schedule}
    in_play = list(denoms)
    out: list[dict[str, Any]] = []
    for idx, level in enumerate(levels):
        if idx in retire_at and len(in_play) > 1:
            in_play = in_play[1:]
        if is_break(level) or not in_play:
            continue
        smallest = in_play[0]
        bad = [a for a in level_amounts(level) if a % smallest]
        if bad:
            out.append({
                "level_index": idx,
                "smallest_denom_cents": smallest,
                "amounts_cents": bad,
            })
    return out


def _split_limits(active: list[dict[str, Any]], start_stacks: int, rebuy_stacks: int,
                  start_value: int, rebuy_value: int) -> list[int]:
    """Per-stack cap for the starting stack, reserving inventory for rebuys by value share."""
    total_value = start_value + rebuy_value
    limits = []
    for chip in active:
        qty = chip["qty"]
        share = qty if total_value <= 0 else qty * start_value // total_value
        limits.append(share // start_stacks if start_stacks > 0 else 0)
    return limits


def _empty_plan(errors: list[dict[str, Any]], warnings: list[dict[str, Any]], players: int = 0,
                max_rebuys: int = 0) -> dict[str, Any]:
    """Failure envelope with the same shape as a successful plan."""
    return {
        "ok": False,
        "errors": errors,
        "warnings": warnings,
        "players": players,
        "max_rebuys": max_rebuys,
        "starting": None,
        "rebuy": None,
        "inventory": [],
        "color_ups": [],
        "denoms_in_play_at_end": [],
    }


def plan_chips(
    *,
    chips: list[dict[str, Any]],
    players: int,
    max_rebuys: int,
    starting_stack_cents: int,
    rebuy_stack_cents: int,
    levels: list[dict[str, Any]],
    color_ups: bool = True,
) -> dict[str, Any]:
    """Work out how many chips of each color every player gets.

    Worst case by design: every player is assumed to use all of their rebuys, so
    the inventory is guaranteed to cover the night.
    """
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    active = sorted(
        [c for c in chips
         if c.get("enabled", True) and int(c.get("denom_cents") or 0) > 0 and int(c.get("qty") or 0) > 0],
        key=lambda c: int(c["denom_cents"]),
    )
    active = [{"color": c["color"], "denom_cents": int(c["denom_cents"]), "qty": int(c["qty"])} for c in active]

    # Two colours worth the same amount would make the plan ambiguous; keep the first.
    deduped, seen = [], set()
    for chip in active:
        if chip["denom_cents"] in seen:
            warnings.append({"code": "duplicate_denomination", "color": chip["color"],
                             "denom_cents": chip["denom_cents"]})
            continue
        seen.add(chip["denom_cents"])
        deduped.append(chip)
    active = deduped

    players = max(0, int(players))
    max_rebuys = max(0, int(max_rebuys))
    starting_stack_cents = max(0, int(starting_stack_cents))
    rebuy_stack_cents = max(0, int(rebuy_stack_cents))

    if not active:
        errors.append({"code": "no_chips"})
    if players <= 0:
        errors.append({"code": "no_players"})
    if starting_stack_cents <= 0:
        errors.append({"code": "no_starting_stack"})
    if errors:
        return _empty_plan(errors, warnings, players, max_rebuys)

    denoms = [c["denom_cents"] for c in active]
    start_stacks = players
    rebuy_stacks = players * max_rebuys
    if rebuy_stack_cents <= 0:
        rebuy_stacks = 0
    start_value = start_stacks * starting_stack_cents
    rebuy_value = rebuy_stacks * rebuy_stack_cents
    needed_value = start_value + rebuy_value
    owned_value = sum(c["denom_cents"] * c["qty"] for c in active)

    if owned_value < needed_value:
        errors.append({
            "code": "insufficient_value",
            "needed_cents": needed_value,
            "owned_cents": owned_value,
        })
        return _empty_plan(errors, warnings, players, max_rebuys)

    opening = regular_levels(levels)[0] if regular_levels(levels) else None
    floor = granularity_floor(denoms, opening)
    if opening is not None:
        unit = blind_unit(opening)
        if unit > 0 and not any(unit % d == 0 for d in denoms):
            warnings.append({"code": "no_chip_divides_blinds", "unit_cents": unit})

    opening_bb = int(opening.get("big_blind_cents") or 0) if opening else 0

    start_denoms: list[int] = []
    start_counts: list[int] | None = None
    start_limits: list[int] = []
    for attempt, candidate in enumerate(denom_candidates(denoms, floor, starting_stack_cents)):
        idx = {d: denoms.index(d) for d in candidate}
        limits = _split_limits(
            [active[idx[d]] for d in candidate], start_stacks, rebuy_stacks, start_value, rebuy_value
        )
        counts = solve_stack(candidate, limits, starting_stack_cents, opening_bb)
        if counts is not None:
            start_denoms, start_counts, start_limits = candidate, counts, limits
            if attempt > 0:
                # Only reachable by reaching for a chip we would rather not deal.
                warnings.append({"code": "supply_forced_large_chip", "denom_cents": max(candidate)})
            break
    if not start_denoms:
        start_denoms = stack_denoms(denoms, floor, starting_stack_cents)
        start_limits = _split_limits(
            [active[denoms.index(d)] for d in start_denoms], start_stacks, rebuy_stacks, start_value, rebuy_value
        )
    if len(start_denoms) < 2:
        # One denomination means 20 identical chips -- no mix to make change with.
        warnings.append({
            "code": "single_denomination",
            "denom_cents": start_denoms[0] if start_denoms else 0,
        })
    index_of = {d: denoms.index(d) for d in start_denoms}
    if start_counts is None:
        # Distinguish "you don't own enough chips" from "these denominations can't
        # make this number at all" -- very different things to tell the user.
        unlimited = [10 ** 6] * len(start_denoms)
        code = ("insufficient_supply" if solve_stack(start_denoms, unlimited, starting_stack_cents, opening_bb)
                else "starting_stack_unmakeable")
        errors.append({
            "code": code,
            "stack_cents": starting_stack_cents,
            "denoms_cents": start_denoms,
        })
        return _empty_plan(errors, warnings, players, max_rebuys)

    used = {c["color"]: 0 for c in active}
    for d, n in zip(start_denoms, start_counts):
        used[active[index_of[d]]["color"]] += n * start_stacks

    rebuy_denoms: list[int] = []
    rebuy_counts: list[int] | None = None
    if rebuy_stacks > 0:
        for candidate in denom_candidates(denoms, floor, rebuy_stack_cents):
            limits = []
            for d in candidate:
                chip = active[denoms.index(d)]
                limits.append(max(0, (chip["qty"] - used[chip["color"]]) // rebuy_stacks))
            counts = solve_stack(candidate, limits, rebuy_stack_cents, opening_bb)
            rebuy_denoms, rebuy_limits = candidate, limits
            if counts is not None:
                rebuy_counts = counts
                break
        if rebuy_counts is None:
            unlimited = [10 ** 6] * len(rebuy_denoms)
            errors.append({
                "code": ("insufficient_supply" if solve_stack(rebuy_denoms, unlimited, rebuy_stack_cents, opening_bb)
                         else "rebuy_stack_unmakeable"),
                "stack_cents": rebuy_stack_cents,
                "denoms_cents": rebuy_denoms,
            })
        else:
            for d, n in zip(rebuy_denoms, rebuy_counts):
                chip = active[denoms.index(d)]
                used[chip["color"]] += n * rebuy_stacks

    schedule: list[dict[str, Any]] = []
    remaining_denoms = list(start_denoms)
    if color_ups:
        colorup_pool = [d for d in denoms if d >= floor]
        schedule, remaining_denoms = plan_color_ups(levels, start_denoms, colorup_pool)
    checks = level_warnings(levels, start_denoms, schedule)
    if checks:
        warnings.append({"code": "levels_not_payable", "levels": checks})

    issued: dict[int, int] = {}
    for d, n in zip(start_denoms, start_counts):
        issued[d] = issued.get(d, 0) + n * start_stacks
    if rebuy_counts is not None:
        for d, n in zip(rebuy_denoms, rebuy_counts):
            issued[d] = issued.get(d, 0) + n * rebuy_stacks
    for step in schedule:
        # Every retired chip comes back as 1/ratio of the larger one, rounded up.
        count = issued.get(step["retire_denom_cents"], 0)
        step["reserve_needed"] = -(-count // step["ratio"]) if step["ratio"] else 0
        target = active[denoms.index(step["into_denom_cents"])]
        spare = target["qty"] - used[target["color"]]
        step["reserve_spare"] = spare
        if spare < step["reserve_needed"]:
            warnings.append({
                "code": "color_up_short",
                "color": target["color"],
                "denom_cents": target["denom_cents"],
                "needed": step["reserve_needed"],
                "spare": spare,
            })

    inventory = []
    for chip in active:
        u = used[chip["color"]]
        inventory.append({
            "color": chip["color"],
            "denom_cents": chip["denom_cents"],
            "owned": chip["qty"],
            "used": u,
            "remaining": chip["qty"] - u,
        })
        if chip["qty"] - u < 0:
            errors.append({"code": "oversubscribed", "color": chip["color"]})
        elif u > 0 and chip["qty"] == u:
            # Every chip of this color is committed; a miscount leaves no slack.
            warnings.append({"code": "no_spare_chips", "color": chip["color"], "denom_cents": chip["denom_cents"]})

    # A binding per-stack cap means the mix was compromised by what's on hand.
    for d, n, limit in zip(start_denoms, start_counts, start_limits):
        if n >= limit and limit > 0:
            warnings.append({
                "code": "supply_limited",
                "color": active[index_of[d]]["color"],
                "denom_cents": d,
                "per_stack_limit": limit,
            })

    def describe(ds: list[int], cs: list[int], stacks: int) -> list[dict[str, Any]]:
        """Per-stack counts plus the pile to count out of the box for every stack."""
        return [
            {"color": active[denoms.index(d)]["color"], "denom_cents": d, "count": n, "total": n * stacks}
            for d, n in zip(ds, cs) if n > 0
        ]

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "players": players,
        "max_rebuys": max_rebuys,
        "starting": {
            "stack_cents": starting_stack_cents,
            "chips": describe(start_denoms, start_counts, start_stacks),
            "total_chips": sum(start_counts),
            "total_chips_all": sum(start_counts) * start_stacks,
            "stacks": start_stacks,
        },
        "rebuy": None if rebuy_counts is None else {
            "stack_cents": rebuy_stack_cents,
            "chips": describe(rebuy_denoms, rebuy_counts, rebuy_stacks),
            "total_chips": sum(rebuy_counts),
            "total_chips_all": sum(rebuy_counts) * rebuy_stacks,
            "stacks": rebuy_stacks,
        },
        "inventory": inventory,
        "color_ups": schedule,
        "denoms_in_play_at_end": remaining_denoms,
    }
