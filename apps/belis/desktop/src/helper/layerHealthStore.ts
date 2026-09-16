/**
 * Shared result of the layer availability check (see layerHealth.ts). Module
 * level because two callers start runs: the app at startup and the drawer on
 * every opening, so a startup run must outlive the panel's mount.
 */

import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
} from "../config/mapLayerConfigs";
import { probeLayerEntryWithRetry, type LayerHealth } from "./layerHealth";

export type LayerHealthMap = Record<string, LayerHealth>;

export interface LayerHealthState {
  health: LayerHealthMap;
  /** No network at all; one note beats ten red rows. */
  offline: boolean;
}

const EMPTY_STATE: LayerHealthState = { health: {}, offline: false };

let state: LayerHealthState = EMPTY_STATE;
let running = false;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const setState = (next: LayerHealthState) => {
  state = next;
  emit();
};

export const subscribeLayerHealth = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getLayerHealthState = (): LayerHealthState => state;

const layerEntries = () => [
  ...Object.entries(backgroundLayerConfigs),
  ...Object.entries(additionalLayerConfigs),
];

/**
 * Check every configured layer. Concurrent calls are dropped, not queued: a
 * run from a moment ago is still current, and restarting resets rows.
 */
export const runLayerHealthCheck = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState({ health: {}, offline: true });
      return;
    }

    const entries = layerEntries();
    // Keep known verdicts so reopening the panel does not flash the list.
    const health: LayerHealthMap = { ...state.health };
    for (const [key] of entries) {
      health[key] = health[key] ?? "checking";
    }
    setState({ health, offline: false });

    await Promise.all(
      entries.map(async ([key, entry]) => {
        const ok = await probeLayerEntryWithRetry(entry);
        setState({
          ...state,
          health: { ...state.health, [key]: ok ? "ok" : "broken" },
        });
      })
    );
  } finally {
    running = false;
  }
};

/** Deferred to idle so probes do not compete with the map's first tiles. */
export const scheduleInitialLayerHealthCheck = (): void => {
  const start = () => void runLayerHealthCheck();
  const idle = (
    window as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => void;
    }
  ).requestIdleCallback;
  if (idle) {
    idle(start, { timeout: 5000 });
  } else {
    window.setTimeout(start, 2000);
  }
};
