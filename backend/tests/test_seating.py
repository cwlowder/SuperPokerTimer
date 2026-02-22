from app.seating import (
    assign_seats_for_table_groups,
    compute_table_targets,
    end_fill_seat_order,
    select_tables_by_capacity,
    select_tables_for_rebalance,
)


def test_end_fill_seat_order_full_table_8() -> None:
    assert end_fill_seat_order(8, list(range(1, 9))) == [1, 8, 2, 7, 3, 6, 4, 5]


def test_end_fill_seat_order_subset() -> None:
    # Only seats 1,2,4,8 are open
    assert end_fill_seat_order(8, [2, 8, 4, 1]) == [1, 8, 2, 4]


def test_compute_table_targets_works_with_table_selection() -> None:
    tables = [
        {"id": "t1", "seats": 9},
        {"id": "t2", "seats": 9},
        {"id": "t3", "seats": 9},
    ]

    # With a 4-player minimum, 8 players should consolidate to 2 tables.
    used = select_tables_by_capacity(tables, 8, min_players_per_table=4)
    target = {t["id"]: 0 for t in tables}
    target.update(compute_table_targets(used, 8))

    assert target == {"t1": 4, "t2": 4, "t3": 0}


def test_select_tables_by_capacity_uses_smallest_prefix() -> None:
    tables = [
        {"id": "t1", "seats": 4},
        {"id": "t2", "seats": 4},
        {"id": "t3", "seats": 4},
    ]
    used = select_tables_by_capacity(tables, 6, min_players_per_table=4)
    assert [t["id"] for t in used] == ["t1", "t2"]


def test_select_tables_by_capacity_respects_min_when_capacity_allows() -> None:
    tables = [
        {"id": "t1", "seats": 4},
        {"id": "t2", "seats": 4},
        {"id": "t3", "seats": 10},
    ]
    # With min=4 and 8 players, we can use 2 tables (4 per table).
    used = select_tables_by_capacity(tables, 8, min_players_per_table=4)
    assert [t["id"] for t in used] == ["t1", "t2"]


def test_select_tables_for_rebalance_prefers_tables_with_players() -> None:
    tables = [
        {"id": "t1", "seats": 8},
        {"id": "t2", "seats": 8},
        {"id": "t3", "seats": 8},
    ]
    seated_by_table = {
        "t1": ["a", "b", "c", "d"],
        "t2": ["e"],
        "t3": [],
    }
    # 9 players requires 2 tables. Expect it to pick t1 and t2.
    used_ids = select_tables_for_rebalance(tables, 9, seated_by_table, min_players_per_table=4)
    assert used_ids == {"t1", "t2"}


def test_select_tables_for_rebalance_enforces_min_players_per_table_when_possible() -> None:
    tables = [
        {"id": "t1", "seats": 4},
        {"id": "t2", "seats": 4},
        {"id": "t3", "seats": 10},
    ]
    seated_by_table = {"t1": ["a", "b", "c", "d"], "t2": ["e", "f"], "t3": []}
    # 6 players with min=4 => target is 1 table, but reducing to 1 would force extra moves.
    # Since t1 alone can't seat 6, we must keep at least 2 tables.
    used_ids = select_tables_for_rebalance(tables, 6, seated_by_table, min_players_per_table=4)
    assert used_ids == {"t1", "t2"}


def test_select_tables_for_rebalance_adds_capacity_when_needed() -> None:
    tables = [
        {"id": "t1", "seats": 9},
        {"id": "t2", "seats": 9},
        {"id": "t3", "seats": 9},
    ]
    seated_by_table = {"t1": ["p"] * 9, "t2": ["p"] * 9, "t3": []}
    used_ids = select_tables_for_rebalance(tables, 20, seated_by_table, min_players_per_table=4)
    assert used_ids == {"t1", "t2", "t3"}


def test_assign_seats_keeps_same_seat_and_end_fill_others() -> None:
    tables = [{"id": "t1", "seats": 8}]
    # Group has 4 players.
    table_to_player_ids = {"t1": ["p1", "p2", "p3", "p4"]}
    # p2 previously sat at seat 8 and should keep it.
    prev_map = {"p2": ("t1", 8)}

    out = assign_seats_for_table_groups(
        tables,
        table_to_player_ids,
        prev_map,
        seat_order="end_fill",
        keep_same_seat=True,
    )

    assert out["p2"] == ("t1", 8)

    # Remaining open seats, in end-fill order with seat 8 removed: 1,2,7,3,6,4,5
    # Others are assigned in the order they appear (p1, p3, p4)
    assert out["p1"] == ("t1", 1)
    assert out["p3"] == ("t1", 2)
    assert out["p4"] == ("t1", 7)
