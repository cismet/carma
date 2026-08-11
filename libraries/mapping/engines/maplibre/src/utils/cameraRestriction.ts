import { useCallback, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Who decides whether a MapLibre map stays north-up and flat.
 *
 * Two writers, one applier:
 *
 * - `LibreMap` writes the **base** from its props on every render of its
 *   interaction effect and at map construction. That is the app's own value.
 * - Anything outside the react tree (an addon, a workflow, a debug console)
 *   writes an **override** with `setCameraRestrictionOverride`, which wins over
 *   the base and is dropped again by passing `null`.
 *
 * A base marked `forced` cannot be overridden. That is what keeps app modes
 * which must lock the camera (print, an export frame) safe from configuration
 * that would unlock it.
 *
 * The effective value is applied to the map immediately on every write and
 * published to subscribers, so UI showing a compass or pitch control can read
 * what is actually true instead of re-deriving it from the app's own config.
 */

export type CameraRestriction = {
  restricted: boolean;
  maxPitch: number;
};

/** MapLibre's stock cap and `LibreMap`'s own default */
export const DEFAULT_MAX_PITCH = 60;

export type CameraRestrictionBase = CameraRestriction & {
  forced: boolean;
  interactive: boolean;
};

type Entry = {
  base: CameraRestrictionBase;
  override: CameraRestriction | null;
  effective: CameraRestriction;
  listeners: Set<() => void>;
};

const entries = new WeakMap<MaplibreMap, Entry>();

const DEFAULT_BASE: CameraRestrictionBase = {
  restricted: false,
  maxPitch: DEFAULT_MAX_PITCH,
  forced: false,
  interactive: true,
};

export const applyCameraRestriction = (
  map: MaplibreMap,
  restricted: boolean,
  interactive: boolean,
  maxPitch: number
) => {
  if (restricted) {
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.setMaxPitch(0);
    map.setBearing(0);
  } else {
    if (interactive) {
      map.dragRotate.enable();
      map.touchPitch.enable();
      map.touchZoomRotate.enableRotation();
      map.keyboard.enableRotation();
    }
    map.setMaxPitch(maxPitch);
  }
};

const resolve = ({ base, override }: Entry): CameraRestriction => {
  if (base.forced || !override) {
    return { restricted: base.restricted, maxPitch: base.maxPitch };
  }
  return override;
};

const isSame = (a: CameraRestriction, b: CameraRestriction) =>
  a.restricted === b.restricted && a.maxPitch === b.maxPitch;

const entryOf = (map: MaplibreMap): Entry => {
  const existing = entries.get(map);
  if (existing) {
    return existing;
  }
  const entry: Entry = {
    base: DEFAULT_BASE,
    override: null,
    effective: { restricted: false, maxPitch: DEFAULT_MAX_PITCH },
    listeners: new Set(),
  };
  entries.set(map, entry);
  return entry;
};

/** re-resolve, apply to the map, notify — after any write */
const settle = (map: MaplibreMap, entry: Entry) => {
  const next = resolve(entry);
  const changed = !isSame(entry.effective, next);
  entry.effective = next;

  applyCameraRestriction(
    map,
    next.restricted,
    entry.base.interactive,
    next.maxPitch
  );
  if (changed) {
    for (const listener of entry.listeners) {
      listener();
    }
  }
};

export const setCameraRestrictionBase = (
  map: MaplibreMap,
  base: CameraRestrictionBase
) => {
  const entry = entryOf(map);
  entry.base = base;
  settle(map, entry);
};

export const setCameraRestrictionOverride = (
  map: MaplibreMap,
  override: CameraRestriction | null
) => {
  const entry = entryOf(map);
  entry.override = override;
  settle(map, entry);
};

export const getCameraRestriction = (
  map: MaplibreMap | null
): CameraRestriction | null => (map && entries.get(map)?.effective) ?? null;

export const subscribeCameraRestriction = (
  map: MaplibreMap,
  listener: () => void
) => {
  const entry = entryOf(map);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
};

const NO_MAP_SUBSCRIBE = () => () => undefined;

export const useCameraRestriction = (
  map: MaplibreMap | null
): CameraRestriction | null => {
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeCameraRestriction(map, listener) : NO_MAP_SUBSCRIBE(),
    [map]
  );
  const getSnapshot = useCallback(() => getCameraRestriction(map), [map]);
  return useSyncExternalStore(subscribe, getSnapshot);
};
