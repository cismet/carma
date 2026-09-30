import type { Map as MaplibreMap } from "maplibre-gl";
import type { TileVolumeLoadReason } from "@carma-mapping/engines/maplibre";

import type { ShadowBufferLayout } from "../core/shadow-types";
import type { ShadowSnapshot } from "./shadow-controller";
import type { TiledShadowStats } from "./tiled-shadow-renderer";

export type ShadowProjectionDebugSnapshot = Readonly<{
  bufferLayout: ShadowBufferLayout;
  /** Configured finite-disc sample goal, independent of concurrent lights. */
  sunDiscSamples: number;
  /** Actual page statistics; null before a tiled renderer exists or in mono. */
  tiledStats: TiledShadowStats | null;
  cameraRangeMeters: number;
  leftMeters: number;
  rightMeters: number;
  bottomMeters: number;
  topMeters: number;
  nearMeters: number;
  farMeters: number;
  projectionMatrixElements: readonly number[];
  shadowMapWidth: number;
  shadowMapHeight: number;
  minimumElevationMeters: number;
  maximumElevationMeters: number;
  sceneAnchorPositionElements?: readonly [number, number, number];
  mainCamera?: Readonly<{
    viewMatrixElements: readonly number[];
    projectionMatrixElements: readonly number[];
    nearMeters: number;
    farMeters: number;
    viewportWidth: number;
    viewportHeight: number;
  }>;
  tileVolumes?: readonly Readonly<{
    id: string;
    loadReason?: TileVolumeLoadReason;
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
  }>[];
  shadow?: ShadowSnapshot | null;
  atmosphericSunlight?: Readonly<{
    azimuthDegrees: number;
    elevationDegrees: number;
    relativeIntensity: number;
    color: string;
    transmittanceReady: boolean;
    irradianceReady: boolean;
  }> | null;
}>;

type ShadowProjectionDebugEntry = {
  snapshot: ShadowProjectionDebugSnapshot | null;
  listeners: Set<() => void>;
  demandListeners: Set<(active: boolean) => void>;
};

const entries = new WeakMap<MaplibreMap, ShadowProjectionDebugEntry>();

const getOrCreateEntry = (map: MaplibreMap) => {
  let entry = entries.get(map);
  if (!entry) {
    entry = {
      snapshot: null,
      listeners: new Set(),
      demandListeners: new Set(),
    };
    entries.set(map, entry);
  }
  return entry;
};

export const readShadowProjectionDebugSnapshot = (map: MaplibreMap) =>
  entries.get(map)?.snapshot ?? null;

export const subscribeShadowProjectionDebugSnapshot = (
  map: MaplibreMap,
  listener: () => void
) => {
  const entry = getOrCreateEntry(map);
  const firstSubscriber = entry.listeners.size === 0;
  entry.listeners.add(listener);
  if (firstSubscriber) {
    for (const onDemand of entry.demandListeners) onDemand(true);
  }
  return () => {
    if (!entry.listeners.delete(listener) || entry.listeners.size > 0) return;
    entry.snapshot = null;
    for (const onDemand of entry.demandListeners) onDemand(false);
    if (entry.demandListeners.size === 0) entries.delete(map);
  };
};

/** The lazy panel's real subscription, not its import request, owns capture. */
export const subscribeShadowProjectionDebugDemand = (
  map: MaplibreMap,
  listener: (active: boolean) => void
) => {
  const entry = getOrCreateEntry(map);
  entry.demandListeners.add(listener);
  if (entry.listeners.size > 0) listener(true);
  return () => {
    entry.demandListeners.delete(listener);
    if (entry.listeners.size === 0 && entry.demandListeners.size === 0)
      entries.delete(map);
  };
};

/** Whether anything is listening; publishing without a reader is waste. */
export const hasShadowProjectionDebugListeners = (map: MaplibreMap): boolean =>
  (entries.get(map)?.listeners.size ?? 0) > 0;

export const publishShadowProjectionDebugSnapshot = (
  map: MaplibreMap,
  snapshot: ShadowProjectionDebugSnapshot
) => {
  const entry = entries.get(map);
  if (!entry?.listeners.size) return;
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
};

export const clearShadowProjectionDebugSnapshot = (map: MaplibreMap) => {
  const entry = entries.get(map);
  if (!entry) return;
  entry.snapshot = null;
  for (const listener of entry.listeners) listener();
  if (entry.listeners.size === 0 && entry.demandListeners.size === 0)
    entries.delete(map);
};

type DebugPublisherFactory =
  typeof import("./shadow-projection-debug-publisher").createShadowProjectionDebugPublisher;
let debugPublisherFactory: DebugPublisherFactory | undefined;

/** The optional module installs its capability only when it has been imported. */
export const registerShadowProjectionDebugPublisher = (
  factory: DebugPublisherFactory
) => {
  debugPublisherFactory = factory;
};

/** No snapshot publishing/timer implementation is loaded without a subscriber. */
export const createOptionalShadowProjectionDebugPublisher = (
  ...args: Parameters<DebugPublisherFactory>
) => {
  const [map] = args;
  let publisher: ReturnType<DebugPublisherFactory> | undefined;
  let loading = false;
  let disposed = false;
  let snapshot: ShadowProjectionDebugSnapshot | null = null;
  const ensure = () => {
    if (disposed || !hasShadowProjectionDebugListeners(map)) return undefined;
    if (!publisher && debugPublisherFactory)
      publisher = debugPublisherFactory(...args);
    if (!publisher && !loading) {
      loading = true;
      void import("./shadow-projection-debug-publisher")
        .then((module) => {
          if (disposed || !hasShadowProjectionDebugListeners(map)) return;
          publisher = module.createShadowProjectionDebugPublisher(...args);
          publisher.setSnapshot(snapshot);
          publisher.publish();
        })
        .catch((error) => {
          if (!disposed)
            console.error("Unable to load shadow diagnostics", error);
        })
        .finally(() => {
          loading = false;
        });
    }
    return publisher;
  };
  return {
    publish: () => ensure()?.publish(),
    setSnapshot(value: ShadowProjectionDebugSnapshot | null) {
      snapshot = value;
      ensure()?.setSnapshot(value);
    },
    markStale: () => ensure()?.markStale(),
    reset() {
      snapshot = null;
      publisher?.reset();
    },
    dispose() {
      disposed = true;
      snapshot = null;
      publisher?.dispose();
    },
  };
};
