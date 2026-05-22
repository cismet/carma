import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Feature } from "geojson";
import localforage from "localforage";

import type { DrawMode } from "./MeasurementControls";

export type MeasurementId = string | number;

// Implementations registered by a mounted MeasurementHost. The provider stays
// usable without a host (commands no-op until one mounts and registers).
type MeasurementsCommands = {
  clearAll: () => void;
  deleteById: (id: MeasurementId) => void;
  selectFeature: (id: string) => void;
  deselectAll: () => void;
  updateTitle: (id: MeasurementId, customTitle: string) => void;
};

// Internal bridge between MeasurementHost (publisher) and consumer hooks.
// Not exported; the host reaches it via useMeasurementsRegistry().
type MeasurementsRegistry = {
  publishFeatures: (features: Feature[]) => void;
  publishMode: (mode: DrawMode) => void;
  /** Called from MeasurementHost's terra-draw select/deselect listeners so the
   *  context's `selectedId` mirrors what's selected in the map. Null on
   *  deselect. The host suppresses this call when it triggered the selection
   *  programmatically via `commands.selectFeature` / `commands.deselectAll`
   *  (the consumer already updated `selectedId` locally — see
   *  `selectFeature` / `deselectFeature` below). */
  publishSelection: (id: string | null) => void;
  setCommands: (commands: MeasurementsCommands | null) => void;
  /** Resolves with the features that should seed terra-draw at host mount.
   * Returns the provider's LIVE `features` state (via ref), not a one-time
   * localforage snapshot — this matters when the host mounts and unmounts
   * with mode toggling but the provider stays alive: on a re-mount we
   * must seed from the latest drawings, not from whatever was on disk at
   * provider-mount time. The returned promise only resolves after the
   * provider's initial localforage read has completed, so first-mount
   * callers don't read featuresRef before persisted state is loaded. */
  requestInitialFeatures: () => Promise<Feature[]>;
};

type MeasurementsContextValue = {
  features: Feature[];
  count: number;
  isEmpty: boolean;
  mode: DrawMode;
  selectedId: string | null;
  selectedFeature: Feature | null;
  clearAll: () => void;
  deleteById: (id: MeasurementId) => void;
  selectFeature: (id: string) => void;
  deselectFeature: () => void;
  updateTitle: (id: MeasurementId, customTitle: string) => void;
  __registry: MeasurementsRegistry;
};

const MeasurementsContext = createContext<MeasurementsContextValue | null>(
  null
);

export interface MeasurementsProviderProps {
  children: ReactNode;
  /** When set, the provider hydrates `features` from
   * `localforage.getItem(storageKey)` once at mount and writes the current
   * features back whenever the host publishes a new snapshot (i.e. at every
   * stable moment — `finish`, `clearAll`, `deleteById`, plus the host's
   * safety-net publish on `change("delete")`). When omitted, features live
   * only in memory for the lifetime of the mounted provider. */
  storageKey?: string;
}

export function MeasurementsProvider({
  children,
  storageKey,
}: MeasurementsProviderProps) {
  const [features, setFeatures] = useState<Feature[]>([]);
  // Mirrors the host's `mode` prop so consumers can react to it without
  // threading the prop through their own state. Defaults to "none" before
  // the host mounts and publishes.
  const [mode, setMode] = useState<DrawMode>("none");
  // Selection state mirrors terra-draw's currently selected feature id.
  // Updated by `publishSelection` (map clicks via the host) and by the
  // public `selectFeature` / `deselectFeature` (consumer-driven). Cleared
  // automatically when the host unmounts via `setCommands(null)`.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // commandsRef instead of state so the host's setCommands call inside its
  // mount effect doesn't trigger a re-render of every consumer; the
  // public clearAll/deleteById close over the ref and read it lazily.
  const commandsRef = useRef<MeasurementsCommands | null>(null);
  // Hydration tracking. `isHydrated` gates the persistence effect so the
  // initial render's empty `features` doesn't overwrite stored data before
  // the load resolves. When no storageKey is set there's nothing to wait
  // for, so we start hydrated.
  const [isHydrated, setIsHydrated] = useState<boolean>(!storageKey);
  // Live ref to the latest features state. `requestInitialFeatures` reads
  // through this so re-mounting hosts (mode-toggle re-enter) seed terra-draw
  // from the current state, not from a stale one-time localforage snapshot.
  // The ref is also written synchronously inside the hydrate effect (before
  // the hydration promise resolves) so the very first host mount sees the
  // loaded data immediately on await, without waiting for a React render.
  const featuresRef = useRef<Feature[]>(features);
  featuresRef.current = features;
  // One-shot promise resolved when the initial localforage read finishes
  // (or immediately, when no storageKey is set). Consumers await this before
  // reading featuresRef so they don't get [] before persisted state has
  // loaded. The promise is created lazily on first render and never reset —
  // subsequent host mounts get the already-resolved promise.
  const hydrationResolveRef = useRef<(() => void) | null>(null);
  const hydrationPromiseRef = useRef<Promise<void> | null>(null);
  if (hydrationPromiseRef.current === null) {
    if (!storageKey) {
      hydrationPromiseRef.current = Promise.resolve();
    } else {
      hydrationPromiseRef.current = new Promise<void>((resolve) => {
        hydrationResolveRef.current = resolve;
      });
    }
  }

  const registry = useMemo<MeasurementsRegistry>(
    () => ({
      publishFeatures: (next) => setFeatures(next),
      publishMode: (next) => setMode(next),
      publishSelection: (id) => setSelectedId(id),
      setCommands: (cmds) => {
        commandsRef.current = cmds;
        // Host unmount drops any selection it was tracking — keep context in
        // sync so a lingering selectedId doesn't leave a stale infobox on
        // screen after exiting measurement mode.
        if (cmds === null) {
          setSelectedId(null);
        }
      },
      requestInitialFeatures: async () => {
        // Wait for the provider's hydrate effect to finish reading
        // localforage so featuresRef reflects any persisted state, then
        // return the LIVE features. On host re-mount this returns the
        // user's most recent drawings (held in the provider's `features`
        // state, which survives host unmount), fixing the bug where
        // re-entering measurement mode reset the map to a stale snapshot.
        await hydrationPromiseRef.current!;
        return featuresRef.current;
      },
    }),
    []
  );

  // Initial hydration from localforage. Runs once per provider mount, seeds
  // `features` and resolves the hydration promise so any waiting host can
  // start reading featuresRef. featuresRef is updated synchronously so a
  // host that awaits and reads it immediately doesn't have to wait for
  // React's next render.
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    (async () => {
      try {
        const stored = await localforage.getItem(storageKey);
        if (cancelled) return;
        const loaded = Array.isArray(stored) ? (stored as Feature[]) : [];
        featuresRef.current = loaded;
        setFeatures(loaded);
      } catch (e) {
        console.warn("[carma-measurements] hydrate getItem failed", e);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
          hydrationResolveRef.current?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Persist on every `features` change after hydration completes. Cadence
  // is bounded by how often the host publishes (stable moments only), so
  // no debounce is needed here — a vertex drag fires localforage.setItem
  // once on drag-end, not 60×/sec.
  useEffect(() => {
    if (!storageKey) return;
    if (!isHydrated) return;
    localforage.setItem(storageKey, features).catch((e) => {
      console.warn("[carma-measurements] persist setItem failed", e);
    });
  }, [features, storageKey, isHydrated]);

  const clearAll = useCallback(() => {
    commandsRef.current?.clearAll();
  }, []);

  const deleteById = useCallback((id: MeasurementId) => {
    commandsRef.current?.deleteById(id);
  }, []);

  // Consumer-driven selection. The host's command suppresses its own
  // publishSelection callback (echo-avoidance), so we set the state here
  // explicitly. No-ops gracefully when the host isn't mounted.
  const selectFeature = useCallback((id: string) => {
    commandsRef.current?.selectFeature(id);
    setSelectedId(id);
  }, []);

  const deselectFeature = useCallback(() => {
    commandsRef.current?.deselectAll();
    setSelectedId(null);
  }, []);

  const updateTitle = useCallback(
    (id: MeasurementId, customTitle: string) => {
      commandsRef.current?.updateTitle(id, customTitle);
    },
    []
  );

  const selectedFeature = useMemo<Feature | null>(() => {
    if (selectedId === null) return null;
    return features.find((f) => String(f.id) === selectedId) ?? null;
  }, [selectedId, features]);

  const value = useMemo<MeasurementsContextValue>(
    () => ({
      features,
      count: features.length,
      isEmpty: features.length === 0,
      mode,
      selectedId,
      selectedFeature,
      clearAll,
      deleteById,
      selectFeature,
      deselectFeature,
      updateTitle,
      __registry: registry,
    }),
    [
      features,
      mode,
      selectedId,
      selectedFeature,
      clearAll,
      deleteById,
      selectFeature,
      deselectFeature,
      updateTitle,
      registry,
    ]
  );

  return (
    <MeasurementsContext.Provider value={value}>
      {children}
    </MeasurementsContext.Provider>
  );
}

export type UseMeasurementsResult = {
  features: Feature[];
  count: number;
  isEmpty: boolean;
  mode: DrawMode;
  selectedId: string | null;
  selectedFeature: Feature | null;
  clearAll: () => void;
  deleteById: (id: MeasurementId) => void;
  selectFeature: (id: string) => void;
  deselectFeature: () => void;
  updateTitle: (id: MeasurementId, customTitle: string) => void;
};

export function useMeasurements(): UseMeasurementsResult {
  const ctx = useContext(MeasurementsContext);
  if (!ctx) {
    throw new Error(
      "useMeasurements must be used within a <MeasurementsProvider>"
    );
  }
  return {
    features: ctx.features,
    count: ctx.count,
    isEmpty: ctx.isEmpty,
    mode: ctx.mode,
    selectedId: ctx.selectedId,
    selectedFeature: ctx.selectedFeature,
    clearAll: ctx.clearAll,
    deleteById: ctx.deleteById,
    selectFeature: ctx.selectFeature,
    deselectFeature: ctx.deselectFeature,
    updateTitle: ctx.updateTitle,
  };
}

// Host-only escape hatch — not exported from the library barrel. Throws when
// no provider is mounted above, since the host now requires one.
export function useMeasurementsRegistry(): MeasurementsRegistry {
  const ctx = useContext(MeasurementsContext);
  if (!ctx) {
    throw new Error(
      "<MeasurementHost> must be rendered inside a <MeasurementsProvider>"
    );
  }
  return ctx.__registry;
}
