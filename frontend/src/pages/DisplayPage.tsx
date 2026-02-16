import React, { useMemo } from "react";
import TimerCard from "../components/TimerCard";
import Announcements from "../components/Announcements";
import SoundPlayer from "../components/SoundPlayer";
import ConnectionStatus from "../components/ConnectionStatus";

import { useEventStream } from "../hooks/useEventStream";
import { useTourneyData } from "../hooks/useTourneyData";
import { Player, Table } from "../types";

export default function DisplayPage() {
  const { playersById, tablesById, sounds } = useTourneyData();
  const { settings, state, remainingMs, lastSound, announcements } = useEventStream();

  // Big picture is read-only, but still plays configured sounds.
  const levels = settings?.levels ?? [];

  // For rebalance announcement name resolution, we only have ids from announcements.
  // We'll show names embedded in payload when present.

  return (
    <div className="container" style={{ maxWidth: 1400 }}>
      <SoundPlayer file={lastSound?.file ?? null} playId={lastSound?.playId} preloadFiles={sounds}/>

      <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Big Picture</h1>
        <ConnectionStatus size={25} muted/>
      </div>

      <div style={{ marginTop: 12 }}>
        {settings && state ? (
          <TimerCard state={state} levels={levels} remainingMs={remainingMs ?? 0} bigPic />
        ) : (
          <div className="card">Loading…</div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <Announcements items={announcements} playersById={playersById} tablesById={tablesById} compact />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="muted">
          If you run <span className="kbd">Randomize</span> or <span className="kbd">Rebalance</span> from the admin UI, the latest seat moves appear above.
        </div>
      </div>
    </div>
  );
}
