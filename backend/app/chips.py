"""Chip denomination planning: how many chips of each color each player needs.

Pure functions (no DB, no async) so the heuristics stay unit-testable, like seating.py.
All money values are cents, matching the rest of the app.
"""
from functools import lru_cache
from math import gcd
from typing import Any

# `edge` is the colour of the dashed rim spots; white on every chip except the
# white one, which needs a contrasting rim to stay visible.
CHIP_COLORS: list[dict[str, str]] = [
    {"id": "white",  "label": "White",  "hex": "#F4F1EA", "ink": "#1B1B1B", "edge": "#1F5FBF"},
    {"id": "red",    "label": "Red",    "hex": "#C8102E", "ink": "#FFFFFF", "edge": "#FFFFFF"},
    {"id": "blue",   "label": "Blue",   "hex": "#1F5FBF", "ink": "#FFFFFF", "edge": "#FFFFFF"},
    {"id": "green",  "label": "Green",  "hex": "#1E7A3C", "ink": "#FFFFFF", "edge": "#FFFFFF"},
    {"id": "black",  "label": "Black",  "hex": "#1B1B1B", "ink": "#FFFFFF", "edge": "#FFFFFF"},
    {"id": "purple", "label": "Purple", "hex": "#6B3FA0", "ink": "#FFFFFF", "edge": "#FFFFFF"},
    {"id": "gray",   "label": "Gray",   "hex": "#8A8F98", "ink": "#1B1B1B", "edge": "#FFFFFF"},
    {"id": "yellow", "label": "Yellow", "hex": "#F2C230", "ink": "#1B1B1B", "edge": "#FFFFFF"},
    {"id": "pink",   "label": "Pink",   "hex": "#E56AA0", "ink": "#1B1B1B", "edge": "#FFFFFF"},
    {"id": "orange", "label": "Orange", "hex": "#E8722C", "ink": "#1B1B1B", "edge": "#FFFFFF"},
    {"id": "lightblue", "label": "Light Blue", "hex": "#5BC8E8", "ink": "#1B1B1B", "edge": "#FFFFFF"},
    {"id": "brown", "label": "Brown", "hex": "#6B4A2F", "ink": "#FFFFFF", "edge": "#1B1B1B"},
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
# A chip is "outgrown" once the small blind is this many times its value, which
# makes it a candidate for a clean colour up.
OUTGROWN_RATIO = 5
# ...and simply useless at this point. Past here it is worth retiring the chip even
# if a later level then needs rounding: carrying dead chips all night is worse.
OBSOLETE_RATIO = 10


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


@lru_cache(maxsize=4096)
def _reachable(amount: int, denoms: tuple[int, ...]) -> bool:
    """Can `amount` be made exactly from these denominations, using any number of each?"""
    if amount <= 0:
        return True
    usable = sorted(d for d in denoms if 0 < d <= amount)
    if not usable:
        return False
    reach = [False] * (amount + 1)
    reach[0] = True
    for value in range(usable[0], amount + 1):
        for denom in usable:
            if denom > value:
                break
            if reach[value - denom]:
                reach[value] = True
                break
    return reach[amount]


def payable_with(level: dict[str, Any], denoms: int | list[int]) -> bool:
    """Can every blind/ante at this level be made exactly from the chips in play?

    Not a divisibility test against the smallest chip: 1250 is unreachable with
    100s alone but is 500 + 500 + 250, so the whole set has to be considered.
    """
    pool = (denoms,) if isinstance(denoms, int) else tuple(sorted(set(denoms)))
    if not any(d > 0 for d in pool):
        return False
    return all(_reachable(a, pool) for a in level_amounts(level))


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


def allocate_exchange(
    retired: int,
    low: int,
    candidates: list[int],
    on_hand: dict[int, int],
) -> tuple[list[dict[str, Any]], int]:
    """Spread `retired` chips of value `low` across the larger chips available.

    Works up from the nearest denomination, taking as many of each as there are in
    the box, so a shortage of one chip is covered by the next size up rather than
    stalling the whole colour up. Returns the exchanges and how many chips of `low`
    could not be absorbed.
    """
    left = dict(on_hand)
    taken: dict[int, int] = {}
    remaining = retired
    for denom in candidates:
        if remaining <= 0:
            break
        ratio = denom // low
        count = min(left.get(denom, 0), remaining // ratio)
        if count > 0:
            taken[denom] = taken.get(denom, 0) + count
            left[denom] -= count
            remaining -= count * ratio
    if remaining > 0:
        # A part-stack is left over; round it up into the smallest chip still in the box.
        for denom in candidates:
            if left.get(denom, 0) > 0:
                taken[denom] = taken.get(denom, 0) + 1
                left[denom] -= 1
                remaining = 0
                break
    exchanges = [
        {"into_denom_cents": denom, "ratio": denom // low, "count": count}
        for denom, count in sorted(taken.items())
    ]
    return exchanges, max(0, remaining)


def plan_color_ups(
    levels: list[dict[str, Any]],
    denoms: list[int],
    available: list[int] | None = None,
    issued: dict[int, int] | None = None,
    spare: dict[int, int] | None = None,
) -> tuple[list[dict[str, Any]], list[int], list[dict[str, Any]]]:
    """Retire the smallest chip at breaks once the blinds have outgrown it.

    `denoms` is what starts in play; `available` is every chip that could come
    into play, so a denomination too large for the starting stack can still be
    the target of a later colour up. At most one denomination per break, and only
    when every remaining level can still be paid exactly with the next chip up.

    `issued` is how many of each chip are out on the table and `spare` how many are
    left in the box, so a swap is only proposed into a chip there are enough of.
    Both omitted means supply is not a constraint.

    Returns the schedule, what is left in play, and the breaks that wanted to
    colour up but could not -- silently doing nothing looks like a broken tool.
    """
    pool = sorted(set(available if available is not None else denoms))
    unlimited = spare is None
    on_hand = dict(spare or {})
    out_there = dict(issued or {})
    schedule: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    in_play = list(denoms)
    for idx, level in enumerate(levels):
        if not is_break(level):
            continue
        future = [(i, l) for i, l in enumerate(levels) if i > idx and not is_break(l)]
        if not future or len(in_play) < 2:
            continue
        low, nxt = in_play[0], in_play[1]
        next_sb = int(future[0][1].get("small_blind_cents") or 0)
        if next_sb <= 0:
            continue
        # Still small change? Then the chip has not been outgrown yet; not a problem.
        if low * OUTGROWN_RATIO > next_sb:
            continue
        # Exchange into a chip the retired one divides into, so the swap is a clean
        # multiple rather than an awkward race. Prefer the smallest such chip, but
        # step up to a bigger one when there are not enough of it: ten blues into one
        # purple beats five blues into a black that ran out.
        candidates = [d for d in pool if d > low and d % low == 0]
        if not candidates:
            continue
        retired = out_there.get(low, 0)
        if unlimited:
            nearest = candidates[0]
            exchanges = [{
                "into_denom_cents": nearest,
                "ratio": nearest // low,
                "count": -(-retired // (nearest // low)),
            }]
            shortfall = 0
        else:
            exchanges, shortfall = allocate_exchange(retired, low, candidates, on_hand)
            if not exchanges:
                # Nothing in the box at all; name the largest, which needs the fewest.
                exchanges = [{
                    "into_denom_cents": candidates[-1],
                    "ratio": candidates[-1] // low,
                    "count": -(-retired // (candidates[-1] // low)),
                }]
                shortfall = retired
        reserve = sum(e["count"] for e in exchanges)
        after_swap = sorted(set(in_play[1:] + [e["into_denom_cents"] for e in exchanges]))
        blockers = [i for i, l in future if not payable_with(l, after_swap)]
        # A chip that is merely outgrown stays if anything still needs it. One that
        # is genuinely useless goes anyway -- the odd level gets rounded, which beats
        # every player carrying dead chips for the rest of the night.
        if blockers and low * OBSOLETE_RATIO > next_sb:
            blocked.append({
                "after_level_index": idx,
                "retire_denom_cents": low,
                "needs_denom_cents": nxt,
                "blocking_level_indexes": blockers,
            })
            continue
        step = {
            "after_level_index": idx,
            "retire_denom_cents": low,
            "exchanges": exchanges,
            "reserve_needed": reserve,
            "shortfall": shortfall,
        }
        # The swap consumes the larger chips and hands the smaller ones back.
        for exchange in exchanges:
            denom, count = exchange["into_denom_cents"], exchange["count"]
            on_hand[denom] = on_hand.get(denom, 0) - count
            out_there[denom] = out_there.get(denom, 0) + count
        if blockers:
            step["forced"] = True
            step["rounding_level_indexes"] = blockers
        schedule.append(step)
        in_play = sorted(set(in_play[1:] + [e["into_denom_cents"] for e in exchanges]))
    return schedule, in_play, blocked


def level_warnings(levels: list[dict[str, Any]], denoms: list[int], schedule: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag levels whose blinds can't be posted exactly with the chips in play."""
    steps = {s["after_level_index"]: s for s in schedule}
    in_play = sorted(set(denoms))
    out: list[dict[str, Any]] = []
    for idx, level in enumerate(levels):
        step = steps.get(idx)
        if step is not None:
            # The retired chip leaves and whatever it was traded for arrives.
            arriving = [e["into_denom_cents"] for e in step["exchanges"]]
            in_play = sorted(set(d for d in in_play if d != step["retire_denom_cents"]) | set(arriving))
        if is_break(level) or not in_play:
            continue
        bad = [a for a in level_amounts(level) if not _reachable(a, tuple(in_play))]
        if bad:
            out.append({
                "level_index": idx,
                "smallest_denom_cents": in_play[0],
                "denoms_in_play": list(in_play),
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


# Warnings raised once per chip colour; shown as a single grouped notice.
PER_COLOR_CODES = {
    "no_spare_chips",
    "supply_limited",
    "color_up_short",
    "duplicate_denomination",
    "oversubscribed",
}


def chip_key(colour: str, shape: str) -> str:
    """Stable identity for a token. Colour alone is not unique once plaques exist."""
    return f"{colour}:{shape}"


def group_notices(notices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse per-colour notices into one entry per code.

    Three colours running out is one thing to tell the host, not three.
    Order is preserved: a group sits where its first member appeared.
    """
    out: list[dict[str, Any]] = []
    groups: dict[str, dict[str, Any]] = {}
    for notice in notices:
        code = notice.get("code")
        if code not in PER_COLOR_CODES or "color" not in notice:
            out.append(notice)
            continue
        group = groups.get(code)
        if group is None:
            group = {"code": code, "colors": [], "shapes": [], "denoms_cents": []}
            groups[code] = group
            out.append(group)
        identity = (notice["color"], notice.get("shape", "chip"))
        if identity not in list(zip(group["colors"], group["shapes"])):
            group["colors"].append(notice["color"])
            group["shapes"].append(notice.get("shape", "chip"))
            group["denoms_cents"].append(notice.get("denom_cents"))
    return out


def _empty_plan(errors: list[dict[str, Any]], warnings: list[dict[str, Any]], players: int = 0,
                max_rebuys: int = 0) -> dict[str, Any]:
    """Failure envelope with the same shape as a successful plan."""
    return {
        "ok": False,
        "errors": group_notices(errors),
        "warnings": group_notices(warnings),
        "players": players,
        "max_rebuys": max_rebuys,
        "starting": None,
        "rebuy": None,
        "inventory": [],
        "reserve": [],
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
    active = [
        {
            "color": c["color"],
            "shape": c.get("shape") or "chip",
            "denom_cents": int(c["denom_cents"]),
            "qty": int(c["qty"]),
        }
        for c in active
    ]

    # Two colours worth the same amount would make the plan ambiguous; keep the first.
    deduped, seen = [], set()
    for chip in active:
        if chip["denom_cents"] in seen:
            warnings.append({"code": "duplicate_denomination", "color": chip["color"],
                             "shape": chip["shape"], "denom_cents": chip["denom_cents"]})
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

    used = {chip_key(c["color"], c["shape"]): 0 for c in active}
    for d, n in zip(start_denoms, start_counts):
        chip = active[index_of[d]]
        used[chip_key(chip["color"], chip["shape"])] += n * start_stacks

    rebuy_denoms: list[int] = []
    rebuy_counts: list[int] | None = None
    if rebuy_stacks > 0:
        for candidate in denom_candidates(denoms, floor, rebuy_stack_cents):
            limits = []
            for d in candidate:
                chip = active[denoms.index(d)]
                limits.append(max(0, (chip["qty"] - used[chip_key(chip["color"], chip["shape"])]) // rebuy_stacks))
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
                used[chip_key(chip["color"], chip["shape"])] += n * rebuy_stacks

    # What is on the table and what is left in the box, so colour ups only propose
    # swaps into chips there are actually enough of.
    issued: dict[int, int] = {}
    for d, n in zip(start_denoms, start_counts):
        issued[d] = issued.get(d, 0) + n * start_stacks
    if rebuy_counts is not None:
        for d, n in zip(rebuy_denoms, rebuy_counts):
            issued[d] = issued.get(d, 0) + n * rebuy_stacks
    spare_by_denom = {
        chip["denom_cents"]: chip["qty"] - used[chip_key(chip["color"], chip["shape"])]
        for chip in active
    }

    schedule: list[dict[str, Any]] = []
    remaining_denoms = list(start_denoms)
    if color_ups:
        colorup_pool = [d for d in denoms if d >= floor]
        schedule, remaining_denoms, blocked = plan_color_ups(
            levels, start_denoms, colorup_pool, issued=issued, spare=spare_by_denom
        )
        if blocked:
            warnings.append({"code": "color_up_blocked", "items": blocked})
    checks = level_warnings(levels, start_denoms, schedule)
    if checks:
        warnings.append({"code": "levels_not_payable", "levels": checks})

    for step in schedule:
        # plan_color_ups already spread the swap across whatever was in the box; a
        # shortfall here means there are simply not enough big chips, full stop.
        if step["shortfall"] > 0:
            warnings.append({
                "code": "color_up_short",
                "denom_cents": step["retire_denom_cents"],
                "shortfall": step["shortfall"],
            })

    # Chips that must stay in the box to run the colour ups, on top of what is dealt.
    reserved: dict[int, int] = {}
    for step in schedule:
        for exchange in step["exchanges"]:
            denom = exchange["into_denom_cents"]
            reserved[denom] = reserved.get(denom, 0) + exchange["count"]

    inventory = []
    for chip in active:
        u = used[chip_key(chip["color"], chip["shape"])]
        r = reserved.get(chip["denom_cents"], 0)
        inventory.append({
            "color": chip["color"],
            "shape": chip["shape"],
            "denom_cents": chip["denom_cents"],
            "owned": chip["qty"],
            "used": u,
            "reserved": r,
            "remaining": chip["qty"] - u - r,
        })
        if chip["qty"] - u < 0:
            errors.append({"code": "oversubscribed", "color": chip["color"], "shape": chip["shape"]})
        elif u > 0 and chip["qty"] - u - r <= 0:
            # Everything is committed, between stacks and colour ups; no slack for a miscount.
            warnings.append({"code": "no_spare_chips", "color": chip["color"],
                             "shape": chip["shape"], "denom_cents": chip["denom_cents"]})

    # A binding per-stack cap means the mix was compromised by what's on hand.
    for d, n, limit in zip(start_denoms, start_counts, start_limits):
        if n >= limit and limit > 0:
            warnings.append({
                "code": "supply_limited",
                "color": active[index_of[d]]["color"],
                "shape": active[index_of[d]]["shape"],
                "denom_cents": d,
                "per_stack_limit": limit,
            })

    def describe(ds: list[int], cs: list[int], stacks: int) -> list[dict[str, Any]]:
        """Per-stack counts plus the pile to count out of the box for every stack."""
        return [
            {
                "color": active[denoms.index(d)]["color"],
                "shape": active[denoms.index(d)]["shape"],
                "denom_cents": d,
                "count": n,
                "total": n * stacks,
            }
            for d, n in zip(ds, cs) if n > 0
        ]

    return {
        "ok": not errors,
        "errors": group_notices(errors),
        "warnings": group_notices(warnings),
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
        "reserve": [
            {
                "color": active[denoms.index(d)]["color"],
                "shape": active[denoms.index(d)]["shape"],
                "denom_cents": d,
                "count": n,
            }
            for d, n in sorted(reserved.items()) if d in denoms
        ],
        "color_ups": schedule,
        "denoms_in_play_at_end": remaining_denoms,
    }
