export type LevelType = "regular" | "break";

export type Level = {
  type: LevelType;
  minutes: number;
  small_blind_cents: number;
  big_blind_cents: number;
  ante_cents: number;
};

export type Denomination = "cents" | "whole";

export type ChipColor = { id: string; label: string; hex: string; ink: string };

export type ChipSpec = { color: string; denom_cents: number; qty: number };

export type ChipSettings = {
  enabled: boolean;
  color_ups: boolean;
  players_override: number | null;
  max_rebuys: number;
  starting_stack_cents: number;
  rebuy_stack_cents: number;
  chips: ChipSpec[];
};

export type ChipCount = { color: string; denom_cents: number; count: number; total: number };

export type ChipStackPlan = {
  stack_cents: number;
  chips: ChipCount[];
  total_chips: number;
  total_chips_all: number;
  stacks: number;
};

export type ChipInventoryRow = { color: string; denom_cents: number; owned: number; used: number; remaining: number };

export type ColorUpStep = {
  after_level_index: number;
  retire_denom_cents: number;
  into_denom_cents: number;
  ratio: number;
  reserve_needed: number;
  reserve_spare: number;
};

export type ChipPlan = {
  ok: boolean;
  errors: { code: string; [k: string]: any }[];
  warnings: { code: string; [k: string]: any }[];
  players: number;
  registered_players: number;
  max_rebuys: number;
  starting: ChipStackPlan | null;
  rebuy: ChipStackPlan | null;
  inventory: ChipInventoryRow[];
  color_ups: ColorUpStep[];
  denoms_in_play_at_end: number[];
};

export type Settings = {
  levels: Level[];
  sounds: {
    transition: string | null;
    half: string | null;
    thirty: string | null;
    five: string | null;
    end: string | null;
  };
  seating?: {
    min_players_per_table?: number;
  };
  currency?: {
    symbol?: string;
    denomination?: Denomination;
  };
  chips?: ChipSettings;
};

export type State = {
  current_level_index: number;
  running: true;
  server_time_ms: number;
  remaining_ms: number;
  finish_at_server_ms: number;
};

export type Player = { id: string; name: string; eliminated: boolean; };

export type Table = { id: string; name: string; seats: number; enabled: boolean; };

export type Seat = { table_id: string; table_name: string; seat_num: number; player_id: string | null; };

export type Announcement = { id?: number; created_at_ms: number; type: string; payload: any; };
