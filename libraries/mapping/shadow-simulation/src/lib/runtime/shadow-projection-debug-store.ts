import type { Map as MaplibreMap } from "maplibre-gl";

import type { ShadowSnapshot } from "./shadow-controller";

export type ShadowProjectionDebugSnapshot = Readonly<{
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
    loadReason?: "viewport" | "shadow";
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
};

const entries = new WeakMap<MaplibreMap, ShadowProjectionDebugEntry>();

const getOrCreateEntry = (map: MaplibreMap) => {
  let entry = entries.get(map);
  if (!entry) {
    entry = { snapshot: null, listeners: new Set() };
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
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
};

/** Whether anything is listening; publishing without a reader is waste. */
export const hasShadowProjectionDebugListeners = (map: MaplibreMap): boolean =>
  (entries.get(map)?.listeners.size ?? 0) > 0;

export const publishShadowProjectionDebugSnapshot = (
  map: MaplibreMap,
  snapshot: ShadowProjectionDebugSnapshot
) => {
  const entry = getOrCreateEntry(map);
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
};

export const clearShadowProjectionDebugSnapshot = (map: MaplibreMap) => {
  const entry = entries.get(map);
  if (!entry) return;
  entry.snapshot = null;
  for (const listener of entry.listeners) listener();
  if (entry.listeners.size === 0) entries.delete(map);
};
