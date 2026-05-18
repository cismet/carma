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
};

// Internal bridge between MeasurementHost (publisher) and consumer hooks.
// Not exported; the host reaches it via useMeasurementsRegistry().
type MeasurementsRegistry = {
  publishFeatures: (features: Feature[]) => void;
  publishMode: (mode: DrawMode) => void;
  setCommands: (commands: MeasurementsCommands | null) => void;
  /** Resolves with the features previously written under `storageKey`. When
   * no key is configured (or no stored data), resolves with `[]`. The
   * promise is cached so concurrent hosts (or basemap-swap reattach paths)
   * share the same hydrate; the host awaits this inside attach() before
   * seeding terra-draw. */
  requestInitialFeatures: () => Promise<Feature[]>;
};

type MeasurementsContextValue = {
  features: Feature[];
  count: number;
  isEmpty: boolean;
  mode: DrawMode;
  clearAll: () => void;
  deleteById: (id: MeasurementId) => void;
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
  // commandsRef instead of state so the host's setCommands call inside its
  // mount effect doesn't trigger a re-render of every consumer; the
  // public clearAll/deleteById close over the ref and read it lazily.
  const commandsRef = useRef<MeasurementsCommands | null>(null);
  // Hydration tracking. `isHydrated` gates the persistence effect so the
  // initial render's empty `features` doesn't overwrite stored data before
  // the load resolves. When no storageKey is set there's nothing to wait
  // for, so we start hydrated.
  const [isHydrated, setIsHydrated] = useState<boolean>(!storageKey);
  // Cached load promise so multiple `requestInitialFeatures` callers (e.g.
  // an initial mount + a basemap-swap reattach) share one localforage read.
  const hydratePromiseRef = useRef<Promise<Feature[]> | null>(null);
  // Live storageKey for use inside the cached hydrate promise's closure —
  // the promise is created once but should always read the latest key.
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const registry = useMemo<MeasurementsRegistry>(
    () => ({
      publishFeatures: (next) => setFeatures(next),
      publishMode: (next) => setMode(next),
      setCommands: (cmds) => {
        commandsRef.current = cmds;
      },
      requestInitialFeatures: () => {
        if (hydratePromiseRef.current) return hydratePromiseRef.current;
        const key = storageKeyRef.current;
        if (!key) {
          hydratePromiseRef.current = Promise.resolve([]);
          return hydratePromiseRef.current;
        }
        hydratePromiseRef.current = (async () => {
          try {
            const stored = await localforage.getItem(key);
            if (Array.isArray(stored)) {
              return stored as Feature[];
            }
            return [];
          } catch (e) {
            console.warn("[carma-measurements] hydrate getItem failed", e);
            return [];
          }
        })();
        return hydratePromiseRef.current;
      },
    }),
    []
  );

  // Drive hydration eagerly so the persistence effect's `isHydrated` gate
  // can open even when no host is mounted (e.g. a consumer wanting to
  // read `features` before terra-draw is set up). When storageKey is set
  // we wait for the load and seed `features` from the result; without a
  // key we'd already have started in the hydrated state.
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    registry.requestInitialFeatures().then((loaded) => {
      if (cancelled) return;
      // Only seed if nothing has been published in the meantime — the host
      // may have raced ahead with addFeatures + publishSnapshot, in which
      // case its state is authoritative.
      setFeatures((current) => (current.length === 0 ? loaded : current));
      setIsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, registry]);

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

  const value = useMemo<MeasurementsContextValue>(
    () => ({
      features,
      count: features.length,
      isEmpty: features.length === 0,
      mode,
      clearAll,
      deleteById,
      __registry: registry,
    }),
    [features, mode, clearAll, deleteById, registry]
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
  clearAll: () => void;
  deleteById: (id: MeasurementId) => void;
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
    clearAll: ctx.clearAll,
    deleteById: ctx.deleteById,
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
