export type LevelType = "regular" | "break";

export type Level = {
  type: LevelType;
  minutes: number;
  small_blind_cents: number;
  big_blind_cents: number;
  ante_cents: number;
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
