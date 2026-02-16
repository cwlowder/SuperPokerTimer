import { useEffect, useState } from "react";
import { Announcement, Settings, State } from "../types";

type WSMsg =
  | { type: "state"; payload: { settings: Settings; state: State } }
  | { type: "tick"; payload: Partial<State> } // optional (can keep for other fields)
  | { type: "sound"; payload: { file: string | null; play_id: number } }
  | { type: "announcement"; payload: Announcement }
  | { type: "pong"; payload: { client_send_ms: number; server_time_ms: number } };

function wsUrl(path: string) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

// ---- singleton connection + store ----
let ws: WebSocket | null = null;
let wsConnecting = false;
let retry = 0;

// clock sync
let offsetMs = 0; // serverNow ~= Date.now() + offsetMs
type PongSample = { rtt: number; offset: number; t: number };
let samples: PongSample[] = [];
const SAMPLE_WINDOW = 3;
let pingPeriodMs = 2000; // current target period

// Allow stoping of the ping loop
let pingLooper: number | null = null;
let stableSinceMs: number | null = null;

let timerStatus: "excelent" | "good" | "neutral" | "bad" | "unknown" =  "unknown";

let offsetEmaAbsErr = 0;   // ms, EMA of |offset - offsetMs|
let rttEma = 0;            // ms, EMA of RTT

// store
let store: {
  settings: Settings | null;
  state: State | null;
  lastSound: { file: string | null; playId: number } | null;
  announcements: Announcement[];
  connected: boolean;
} = {
  settings: null,
  state: null,
  lastSound: null,
  announcements: [],
  connected: false
};

const listeners = new Set<(s: typeof store) => void>();
function emit() {
  for (const fn of listeners) fn(store);
}

export function serverNowMs() {
  return Date.now() + offsetMs;
}

function updateOffsetFromPong(clientSendMs: number, serverTimeMs: number) {
  const clientRecvMs = Date.now();
  const rtt = clientRecvMs - clientSendMs;
  const midpoint = (clientSendMs + clientRecvMs) / 2;
  const measuredOffset = serverTimeMs - midpoint;

  // keep a small window + pick best RTT sample
  samples.push({ rtt, offset: measuredOffset, t: clientRecvMs });
  if (samples.length > SAMPLE_WINDOW) samples.shift();

  let best = samples[0];
  for (const s of samples) if (s.rtt < best.rtt) best = s;

  // smooth offset toward best sample
  const alpha = 0.15;
  const prevOffset = offsetMs;
  offsetMs = offsetMs * (1 - alpha) + best.offset * alpha;

  // --- track "inaccuracy" ---
  // how far the new measurement is from our current estimate
  const absErr = Math.abs(measuredOffset - offsetMs);

  // EMA smoothing
  offsetEmaAbsErr = offsetEmaAbsErr * 0.9 + absErr * 0.1;
  rttEma = rttEma * 0.9 + rtt * 0.1;

  // --- adaptive ping period ---
  // fast until stable, then slow down
  const now = clientRecvMs;

  // Tuning thresholds
  const BAD_ERR_MS = 150;   // offset still noisy
  const OK_ERR_MS = 60;     // reasonably stable
  const GOOD_ERR_MS = 25;   // very stable
  const OK_RTT_MS = 120;    // decent network

  // Determine stability
  const isGood = offsetEmaAbsErr < GOOD_ERR_MS && rttEma < OK_RTT_MS;
  const isOk = offsetEmaAbsErr < OK_ERR_MS;

  if (isGood) {
    if (stableSinceMs == null) stableSinceMs = now;
  } else {
    stableSinceMs = null;
  }

  // export type Announcement = { id?: number; created_at_ms: number; type: string; payload: any; };

  // If not stable, ping faster
  if (offsetEmaAbsErr > BAD_ERR_MS) {
    timerStatus = "bad";
    startPingLoop(500); // 2x per second when clearly off
    return;
  }

  // If kinda stable, moderate
  if (!isOk) {
    timerStatus = "neutral";
    startPingLoop(1000);
    return;
  }

  // If very stable for 10s, slow down
  if (stableSinceMs != null && now - stableSinceMs > 10_000) {
    timerStatus = "excelent";
    startPingLoop(5000);
    return;
  }

  timerStatus = "good";
  // Otherwise normal stable rate
  startPingLoop(2000);
}

function sendPing() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const client_send_ms = Date.now();
  try {
    ws.send(JSON.stringify({ type: "ping", payload: { client_send_ms } }));
  } catch {}
}

function startPingLoop(periodMs: number) {
  // restart only if period changed
  if (pingLooper != null && periodMs === pingPeriodMs) return;

  stopPingLoop();
  pingPeriodMs = periodMs;

  pingLooper = window.setInterval(() => {
    sendPing();
  }, pingPeriodMs);
}

function stopPingLoop() {
  if (pingLooper == null) return;
  window.clearInterval(pingLooper);
  pingLooper = null;
}

function seedOffsetFromServerTime(server_time_ms: number) {
  const guess = server_time_ms - Date.now();
  // gentle blend
  offsetMs = offsetMs * 0.7 + guess * 0.3;
}

function computeRemainingMs(state: State | null): number | null {
  if (!state) return null;
  const s: any = state as any;

  if (s.running) {
    if (typeof s.finish_at_server_ms !== "number") return null;
    return Math.max(0, s.finish_at_server_ms - serverNowMs());
  } else {
    if (typeof s.remaining_s === "number") return Math.max(0, s.remaining_s * 1000);
    // Back-compat if old server still sends remaining_ms
    if (typeof s.remaining_ms === "number") return Math.max(0, s.remaining_ms);
    return null;
  }
}

async function ensureInitialState() {
  if (store.settings && store.state) return;
  try {
    const r = await fetch("/api/state");
    const data = await r.json();
    store.settings = data.settings;
    store.state = data.state;

    if (data?.state?.server_time_ms) {
      seedOffsetFromServerTime(data.state.server_time_ms);
    }

    emit();
  } catch {
    // ignore
  }
}

function ensureSocket() {
  if (ws || wsConnecting) return;
  wsConnecting = true;

  const connect = () => {
    ws = new WebSocket(wsUrl("/ws"));

    ws.onopen = () => {
      wsConnecting = false;
      retry = 0;
      store.connected = true;
      emit();

      // immediate sync ping + start ping loop
      try {
        const client_send_ms = Date.now();
        ws?.send(JSON.stringify({ type: "ping", payload: { client_send_ms } }));
      } catch {
        // ignore
      }
      startPingLoop(pingPeriodMs);
    };

    ws.onclose = () => {
      store.connected = false;
      emit();
      ws = null;
      wsConnecting = false;

      stopPingLoop();

      // reconnect with backoff
      retry += 1;
      const delay = Math.min(10_000, 300 * 2 ** retry);
      setTimeout(() => {
        if (listeners.size > 0) ensureSocket();
      }, delay);
    };

    ws.onerror = () => {
      // close handler will schedule reconnect
    };

    ws.onmessage = (evt) => {
      try {
        const msg: WSMsg = JSON.parse(evt.data);

        if (msg.type === "pong") {
          updateOffsetFromPong(msg.payload.client_send_ms, msg.payload.server_time_ms);
          return;
        }

        if (msg.type === "state") {
          store.settings = msg.payload.settings;
          store.state = msg.payload.state;

          const st: any = msg.payload.state as any;
          if (typeof st?.server_time_ms === "number") {
            seedOffsetFromServerTime(st.server_time_ms);
          }

          emit();
          return;
        }

        if (msg.type === "tick") {
          // Optional: keep merging non-time fields. Time should be derived from finish_at_server_ms.
          store.state = store.state ? ({ ...(store.state as any), ...(msg.payload as any) } as State) : (msg.payload as State);

          const st: any = store.state as any;
          if (typeof st?.server_time_ms === "number") {
            seedOffsetFromServerTime(st.server_time_ms);
          }

          emit();
          return;
        }

        if (msg.type === "sound") {
          store.lastSound = msg.payload ? { file: msg.payload.file, playId: msg.payload.play_id } : null;
          emit();
          return;
        }

        if (msg.type === "announcement") {
          store.announcements = [msg.payload, ...store.announcements].slice(0, 50);
          emit();
          return;
        }
      } catch {
        // ignore
      }
    };
  };

  connect();
}

// ---- React hook ----
export function useEventStream() {
  const [settings, setSettings] = useState<Settings | null>(store.settings);
  const [state, setState] = useState<State | null>(store.state);
  const [remainingMs, setRemainingMs] = useState<number | null>(computeRemainingMs(store.state));
  const [lastSound, setLastSound] = useState<{ file: string | null; playId: number } | null>(store.lastSound);
  const [announcements, setAnnouncements] = useState<Announcement[]>(store.announcements);
  const [connected, setConnected] = useState(store.connected);

  // Interval for updating coundown clock
  useEffect(() => {
    const id = window.setInterval(() => {
      const rem = computeRemainingMs(store.state)
      setRemainingMs(rem);
    }, 250);
    return () => window.clearInterval(id);
  }, []);


  // Update when state changes
  useEffect(() => {
    const fn = (s: typeof store) => {
      setSettings(s.settings);
      setState(s.state);
      setRemainingMs(computeRemainingMs(s.state));
      setLastSound(s.lastSound);
      setAnnouncements(s.announcements);
      setConnected(s.connected);
    };

    listeners.add(fn);

    ensureInitialState();
    ensureSocket();

    // emit immediately in case we connected before subscribing
    fn(store);

    return () => {
      listeners.delete(fn);

      // If nobody is listening anymore, close the socket
      if (listeners.size === 0) {
        stopPingLoop();
        try {
          ws?.close();
        } catch {}
        ws = null;
        wsConnecting = false;
        store.connected = false;
      }
    };
  }, []);

  return { settings, state, remainingMs, lastSound, announcements, connected, serverNowMs, timerStatus };
}
