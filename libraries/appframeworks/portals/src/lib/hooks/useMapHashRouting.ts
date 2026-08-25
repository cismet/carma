// TODO: This hook uses Leaflet-specific naming ("getLeafletMap", "getLeafletZoom",
// "LeafletLikeMap") but is also consumed by LibreMap (MapLibre), which wraps its
// map instance in a Leaflet-shaped adapter. The framework switcher context similarly
// labels the 2D slot "leaflet" regardless of the actual engine.
//
// Refactor plan:
// 1. Rename the interface to engine-agnostic names (e.g., "Map2D", "get2DMap",
//    "get2DZoom") in this hook and in UseMapHashRoutingOptions.
// 2. Update MapFrameworkSwitcherContext to use "2d" / "3d" (or "maplibre" / "cesium")
//    instead of "leaflet" / "cesium".
// 3. Update all consumers (LibreMap, GeoportalMap, floodingmap, etc.).
// 4. Keep the actual adapter pattern (MapLibre -> simple {setView, getCenter, ...})
//    since the hash-routing logic only needs center + zoom.

import { useCallback, useEffect, useRef } from "react";
import {
  HASH_CLEAR_STATE_KEY_SET,
  useHashState,
  type HashStateChangeEvent,
} from "@carma-providers/hash-state";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { isMapCenterZoomEquivalent } from "@carma-geo/utils";
import { Degrees } from "@carma-units";
import { useRegisterDefaultMapHashClearStateKeySets } from "./useRegisterDefaultMapHashClearStateKeySets";

export type LatLngZoom = { lat: number; lng: number; zoom: number };

/**
 * Camera orientation of a rotatable 2D engine (MapLibre). Leaflet cannot rotate
 * and reports `undefined`, which leaves the bearing/pitch hash keys untouched
 * instead of clearing them.
 */
export type MapOrientation = { bearing?: number; pitch?: number };

export type Map2DView = LatLngZoom & MapOrientation;

// Same thresholds the 3D writer uses for its near-zero drop (see the shareable
// view state adapter), so a bearing/pitch counts as "flat" in both engines alike.
const BEARING_ZERO_EPSILON_DEG = 0.01;
const PITCH_ZERO_EPSILON_DEG = 0.01;
const ORIENTATION_ROUNDING = 100;

/**
 * The hash carries a bearing in 0..360, which is what the 3D writer normalizes to.
 * MapLibre's `getBearing()` reports -180..180, so a 2D write has to be brought onto
 * the same convention or the very same camera would encode differently per engine.
 */
const normalizeDegrees360 = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

/** Signed distance from north, so 359.99 is as close to zero as 0.01 is. */
const normalizeDegrees180 = (degrees: number) => {
  const normalized = normalizeDegrees360(degrees);
  return normalized > 180 ? normalized - 360 : normalized;
};

/** `undefined` means "drop this key from the hash" (flat, or not reportable). */
const normalizeBearing = (bearing: number | undefined) => {
  if (typeof bearing !== "number" || !Number.isFinite(bearing)) {
    return undefined;
  }
  return Math.abs(normalizeDegrees180(bearing)) <= BEARING_ZERO_EPSILON_DEG
    ? undefined
    : normalizeDegrees360(bearing);
};

const normalizePitch = (pitch: number | undefined) => {
  if (typeof pitch !== "number" || !Number.isFinite(pitch)) {
    return undefined;
  }
  return Math.abs(pitch) <= PITCH_ZERO_EPSILON_DEG ? undefined : pitch;
};

const normalizeOrientation = ({ bearing, pitch }: MapOrientation) => ({
  bearing: normalizeBearing(bearing),
  pitch: normalizePitch(pitch),
});

/** Only engines that actually report an orientation may write those keys. */
const reportsOrientation = ({ bearing, pitch }: MapOrientation) =>
  typeof bearing === "number" || typeof pitch === "number";

const isOrientationEquivalent = (a: MapOrientation, b: MapOrientation) => {
  const round = (value: number) =>
    Math.round(value * ORIENTATION_ROUNDING) / ORIENTATION_ROUNDING;
  // compare signed headings so 0 and 360 match, and pin the ±180 seam to one side
  const roundBearing = (bearing: number | undefined) => {
    const rounded = round(normalizeDegrees180(bearing ?? 0));
    return rounded === -180 ? 180 : rounded;
  };
  return (
    roundBearing(a.bearing) === roundBearing(b.bearing) &&
    round(a.pitch ?? 0) === round(b.pitch ?? 0)
  );
};

const readNumber = (values: Record<string, unknown>, key: string) => {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * lat/lng/zoom always, orientation only when the engine reports it. Normalized
 * orientation values of `undefined` clear their hash key, so untilting the map
 * leaves no stale `p`/`b` behind.
 */
const buildViewHashParams = (view: Map2DView): Record<string, unknown> => {
  const { lat, lng, zoom } = view;
  return reportsOrientation(view)
    ? { lat, lng, zoom, ...normalizeOrientation(view) }
    : { lat, lng, zoom };
};

// Verbose hash-routing logs; enable at runtime via
// globalThis.__CARMA_DEBUG_HASH_ROUTING__ = true
const hashRoutingDebug = (...args: unknown[]) => {
  if (
    (globalThis as { __CARMA_DEBUG_HASH_ROUTING__?: boolean })
      .__CARMA_DEBUG_HASH_ROUTING__
  ) {
    console.debug(...args);
  }
};

type Labels = {
  writeLeafletLike?: string;
  topicMapLocation?: string;
  cesiumScene?: string;
};

type LeafletLikeMap = {
  setView?: (center: { lat: number; lng: number }, zoom?: number) => void;
  panTo?: (center: { lat: number; lng: number }) => void;
  setZoom?: (zoom: number) => void;
  getCenter?: () => { lat: number; lng: number };
  once?: (type: string, fn: (...args: unknown[]) => void) => void;
  // rotatable engines (MapLibre) only; Leaflet leaves these out
  getBearing?: () => number;
  getPitch?: () => number;
  setBearing?: (bearing: number) => void;
  setPitch?: (pitch: number) => void;
};

export interface UseMapHashRoutingOptions {
  getLeafletMap?: () => LeafletLikeMap | null | undefined;
  getLeafletZoom?: () => number;
  labels?: Labels;
  isHashWriteEnabled?: () => boolean;
}

export function useMapHashRouting({
  getLeafletMap,
  getLeafletZoom,
  labels,
  isHashWriteEnabled,
}: UseMapHashRoutingOptions) {
  useRegisterDefaultMapHashClearStateKeySets();
  const { updateHashState, registerOnPopState, getHashStateValues } =
    useHashState();
  const { getIsLeaflet, getIsTransitioning, activeFramework } =
    useMapFrameworkSwitcherContext();

  // Skip leaflet writes when the map move was initiated by a navigation (popstate)
  const navMoveInProgressRef = useRef(false);
  // Remember the popstate target to avoid immediate re-pushing nearly identical coords
  const popstateTargetRef = useRef<Map2DView | null>(null);
  // Debounce timer for framework switch hash updates
  const frameworkSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleTopicMapLocationChange = useCallback(
    (view: Map2DView) => {
      const { lat, lng, zoom } = view;
      const orientation = normalizeOrientation(view);
      const hasOrientation = reportsOrientation(view);
      hashRoutingDebug("[Routing][hash]", lat, lng, zoom, orientation);
      if (isHashWriteEnabled && !isHashWriteEnabled()) {
        hashRoutingDebug(
          "[Routing][hash] (Leaflet) suppress push: hash writes disabled by guard"
        );
        return;
      }
      if (!getIsLeaflet() || getIsTransitioning()) {
        hashRoutingDebug(
          "[Routing][hash] (Leaflet) suppress push: not in Leaflet mode or transitioning"
        );
        return;
      }
      if (navMoveInProgressRef.current) {
        hashRoutingDebug(
          "[Routing][hash] (Leaflet) suppress push: popstate navigation in progress",
          {
            lat,
            lng,
            zoom,
            label: labels?.topicMapLocation ?? "Map:LeafletLike:location",
          }
        );
        return;
      }
      // If we just restored to a target via popstate, allow small drift without pushing
      const target = popstateTargetRef.current;
      if (target) {
        const eq = isMapCenterZoomEquivalent(
          {
            center: { latitude: lat as Degrees, longitude: lng as Degrees },
            zoom,
          },
          {
            center: {
              latitude: target.lat as Degrees,
              longitude: target.lng as Degrees,
            },
            zoom: target.zoom,
          }
        );
        if (eq && (!hasOrientation || isOrientationEquivalent(orientation, target))) {
          hashRoutingDebug(
            "[Routing][hash] (Leaflet) skip push: equals popstate target within tolerance",
            { lat, lng, zoom, orientation, target }
          );
          popstateTargetRef.current = null;
          return;
        }
      }
      // Skip writing if the map is already at the current hash location (within tolerance)
      try {
        const vals = getHashStateValues?.() || {};
        const hLat = Number((vals as Record<string, unknown>).lat) as Degrees;
        const hLng = Number((vals as Record<string, unknown>).lng) as Degrees;
        const hZoom = Number((vals as Record<string, unknown>).zoom) as number;
        const hasAll =
          Number.isFinite(hLat) &&
          Number.isFinite(hLng) &&
          Number.isFinite(hZoom);
        if (hasAll) {
          const eq = isMapCenterZoomEquivalent(
            {
              center: { latitude: lat as Degrees, longitude: lng as Degrees },
              zoom,
            },
            {
              center: { latitude: hLat, longitude: hLng },
              zoom: hZoom,
            }
          );
          const hashOrientation = {
            bearing: readNumber(vals as Record<string, unknown>, "bearing"),
            pitch: readNumber(vals as Record<string, unknown>, "pitch"),
          };
          if (
            eq &&
            (!hasOrientation ||
              isOrientationEquivalent(orientation, hashOrientation))
          ) {
            hashRoutingDebug(
              "[Routing][hash] (LeafletLike) skip push: equals current hash within tolerance",
              { lat, lng, zoom, orientation, hLat, hLng, hZoom, hashOrientation }
            );
            return;
          }
        }
      } catch {}
      updateHashState(
        buildViewHashParams(view),
        {
          clearStateKeySetIds: [HASH_CLEAR_STATE_KEY_SET.LAUNCH_MODE],
          label: labels?.topicMapLocation ?? "Map:2D:location",
          replace: false,
        }
      );
    },
    [
      getIsLeaflet,
      getIsTransitioning,
      updateHashState,
      getHashStateValues,
      labels?.topicMapLocation,
      isHashWriteEnabled,
    ]
  );

  const readCurrent2DView = useCallback((): Map2DView | null => {
    const map = getLeafletMap?.();
    if (
      !map ||
      typeof map.getCenter !== "function" ||
      typeof getLeafletZoom !== "function"
    ) {
      return null;
    }
    const center = map.getCenter();
    return {
      lat: center.lat,
      lng: center.lng,
      zoom: getLeafletZoom(),
      bearing: map.getBearing?.(),
      pitch: map.getPitch?.(),
    };
  }, [getLeafletMap, getLeafletZoom]);

  const prevIsModeLeafletLikeRef = useRef<boolean>(getIsLeaflet());
  useEffect(() => {
    const wasLeafletLike = prevIsModeLeafletLikeRef.current;
    const isLeafletLike = getIsLeaflet();
    // Only update hash when transitioning TO Leaflet AND not currently transitioning
    if (!wasLeafletLike && isLeafletLike && !getIsTransitioning()) {
      if (isHashWriteEnabled && !isHashWriteEnabled()) {
        prevIsModeLeafletLikeRef.current = isLeafletLike;
        return;
      }
      // Write the current 2D location. The cesium writer drops its own 3D-only
      // keys on handover (neutralize), so the routing leaves them alone here.
      const view = readCurrent2DView();
      if (view) {
        updateHashState(buildViewHashParams(view), {
          label: labels?.writeLeafletLike ?? "Map:2D:writeLocation",
        });
      }
    }
    prevIsModeLeafletLikeRef.current = isLeafletLike;
  }, [
    getIsLeaflet,
    getIsTransitioning,
    updateHashState,
    readCurrent2DView,
    labels?.writeLeafletLike,
    isHashWriteEnabled,
  ]);

  // Trigger hash update when framework switch completes (debounced)
  useEffect(() => {
    // Clear any pending timer
    if (frameworkSwitchTimerRef.current) {
      clearTimeout(frameworkSwitchTimerRef.current);
    }

    if (getIsTransitioning()) {
      return;
    }

    // Debounce hash update by 200ms to ensure map has settled
    frameworkSwitchTimerRef.current = setTimeout(() => {
      if (getIsLeaflet()) {
        const view = readCurrent2DView();
        if (view) {
          handleTopicMapLocationChange(view);
        }
      }
      // Note: Cesium updates should be handled via setting camera position already
    }, 200);

    return () => {
      if (frameworkSwitchTimerRef.current) {
        clearTimeout(frameworkSwitchTimerRef.current);
      }
    };
  }, [
    activeFramework,
    getIsTransitioning,
    getIsLeaflet,
    readCurrent2DView,
    handleTopicMapLocationChange,
  ]);

  // Back/forward navigation: move the leaflet map to the historical location without writing a new hash
  useEffect(() => {
    if (!getLeafletMap) return;

    const handlePopState = (e: HashStateChangeEvent) => {
      if (e.source !== "popstate") return;
      if (!getIsLeaflet()) return;
      const lat = e.stateValues.lat as number | undefined;
      const lng = e.stateValues.lng as number | undefined;
      const zoomFromHash = e.stateValues.zoom as number | undefined;
      const fallbackZoom = getLeafletZoom?.();
      const zoom = zoomFromHash ?? fallbackZoom;

      if (lat == null || lng == null || zoom == null) return;
      const map = getLeafletMap?.();
      if (!map) return;
      // absent orientation params mean "flat", so a rotatable engine is reset
      // rather than left at whatever the previous entry had
      const bearing = (e.stateValues.bearing as number | undefined) ?? 0;
      const pitch = (e.stateValues.pitch as number | undefined) ?? 0;

      navMoveInProgressRef.current = true;
      popstateTargetRef.current = { lat, lng, zoom, bearing, pitch };
      const scheduleClear = (evt: string) => {
        if (typeof map.once === "function") {
          map.once(evt, () => {
            setTimeout(() => {
              navMoveInProgressRef.current = false;
            }, 0);
          });
        }
      };
      scheduleClear("moveend");
      scheduleClear("zoomend");
      map.setBearing?.(bearing);
      map.setPitch?.(pitch);
      if (typeof map.setView === "function") {
        map.setView({ lat, lng }, zoom);
      } else if (typeof map.panTo === "function") {
        map.panTo({ lat, lng });
        if (typeof map.setZoom === "function") {
          map.setZoom(zoom);
        }
      }
    };

    return registerOnPopState(handlePopState);
  }, [registerOnPopState, getIsLeaflet, getLeafletMap, getLeafletZoom]);

  return { handleTopicMapLocationChange };
}
