import { useEffect, useState } from "react";
import { Announcement, Settings, State } from "../types";

type WSMsg =
  | { type: "state"; payload: { settings: Settings; state: State } }
  | { type: "tick"; payload: Partial<State> }
  | { type: "sound"; payload: { file: string | null; play_id: number } }
  | { type: "announcement"; payload: Announcement }
  | { type: "ping"; payload: {} };

function wsUrl(path: string) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}

// ---- singleton connection + store ----
let ws: WebSocket | null = null;
let wsConnecting = false;
let retry = 0;

let store: {
  settings: Settings | null;
  state: State | null;
  lastSound:  {file: string | null; playId: number } | null;
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

async function ensureInitialState() {
  if (store.settings && store.state) return;
  try {
    const r = await fetch("/api/state");
    const data = await r.json();
    store.settings = data.settings;
    store.state = data.state;
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
    };

    ws.onclose = () => {
      store.connected = false;
      emit();
      ws = null;
      wsConnecting = false;

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

        if (msg.type === "state") {
          store.settings = msg.payload.settings;
          store.state = msg.payload.state;
          emit();
          return;
        }

        if (msg.type === "tick") {
          store.state = store.state ? { ...store.state, ...msg.payload } : (msg.payload as State);
          emit();
          return;
        }

        if (msg.type === "sound") {
          console.log(msg.payload);
          store.lastSound = msg.payload ? {file: msg.payload.file, playId: msg.payload.play_id} : null;
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
  const [lastSound, setLastSound] = useState<{ file: string | null; playId: number } | null>(store.lastSound);
  const [announcements, setAnnouncements] = useState<Announcement[]>(store.announcements);
  const [connected, setConnected] = useState(store.connected);

  useEffect(() => {
    const fn = (s: typeof store) => {
      setSettings(s.settings);
      setState(s.state);
      setLastSound(s.lastSound);
      setAnnouncements(s.announcements);
      setConnected(s.connected);
    };

    listeners.add(fn);
    console.log("[ws] hook mounted");

    ensureInitialState();
    ensureSocket();

    // emit immediately in case we connected before subscribing
    fn(store);

    return () => {
      console.log("[ws] hook unmounted");
      listeners.delete(fn);
      // If nobody is listening anymore, close the socket
      if (listeners.size === 0) {
        try {
          ws?.close();
        } catch {}
        ws = null;
        wsConnecting = false;
        store.connected = false;
      }
    };
  }, []);

  return { settings, state, lastSound, announcements, connected };
}
