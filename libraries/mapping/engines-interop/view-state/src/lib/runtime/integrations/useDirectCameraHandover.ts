import { useCallback, useRef } from "react";

import type { Map as MapLibreMap } from "maplibre-gl";

import { Cartographic, type CesiumTerrainProvider, type Scene } from "@carma-cesium";
import {
  isValidCesiumTerrainProvider,
  sampleTerrainMostDetailedGuardedAsync,
} from "@carma-mapping/engines/cesium/core";
import { isFiniteNumber } from "@carma-commons/math";
import { radToDegNumeric } from "@carma-units";

import { applyToCesium, readFromCesium } from "../../adapters/cesium";
import { applyToMaplibre, readFromMaplibre } from "../../adapters/maplibre";
import { deriveOrbitAngles, deriveZoom } from "../../core/derivations";
import type { SubscribedRuntimeBridgeHandle } from "../bridges/useSubscribedRuntimeBridge";

/**
 * Ground height (m) used when the surface/terrain provider cannot be sampled for
 * the 2D->3D handover. Matches the leaflet transition default.
 */
const SWITCH_SURFACE_FALLBACK_HEIGHT_M = 350;

/**
 * Same thresholds the hash writers use to decide a camera is flat, so "the URL
 * carries a b/p" and "the handover goes direct" can never disagree.
 */
const BEARING_ZERO_EPSILON_DEG = 0.01;
const PITCH_ZERO_EPSILON_DEG = 0.01;

const normalizeDegrees180 = (degrees: number) => {
  const normalized = degrees % 360;
  const wrapped = normalized < 0 ? normalized + 360 : normalized;
  return wrapped > 180 ? wrapped - 360 : wrapped;
};

/** A 2D camera worth preserving: tilted, rotated, or both. */
const hasOrientation = (map: MapLibreMap) =>
  Math.abs(map.getPitch()) > PITCH_ZERO_EPSILON_DEG ||
  Math.abs(normalizeDegrees180(map.getBearing())) > BEARING_ZERO_EPSILON_DEG;

const readGroundHeightM = async (
  map: MapLibreMap,
  provider: CesiumTerrainProvider | null | undefined
): Promise<number> => {
  if (!isValidCesiumTerrainProvider(provider)) {
    return SWITCH_SURFACE_FALLBACK_HEIGHT_M;
  }

  const center = map.getCenter();
  const [sampled] = await sampleTerrainMostDetailedGuardedAsync(provider, [
    Cartographic.fromDegrees(
      center.lng,
      center.lat,
      SWITCH_SURFACE_FALLBACK_HEIGHT_M
    ),
  ]);

  return sampled && Number.isFinite(sampled.height)
    ? sampled.height
    : SWITCH_SURFACE_FALLBACK_HEIGHT_M;
};

export type UseDirectCameraHandoverOptions = {
  /** View-adapter id, used as the source id of the states read here. */
  id: string;
  map?: MapLibreMap | null;
  getScene: () => Scene | null | undefined;
  /** Preferred first, terrain second — the surface model is what the 2D tiles sit on. */
  getSurfaceProvider: () => CesiumTerrainProvider | null | undefined;
  getTerrainProvider: () => CesiumTerrainProvider | null | undefined;
  /** The 2D bridge, so the shared view state moves with the camera. */
  maplibreBridge: SubscribedRuntimeBridgeHandle;
  /**
   * Whether the 2D camera may rotate and tilt right now (i.e. the camera
   * restriction is not active). Passed in rather than read here: this library
   * must not depend on the maplibre engine package, which depends on portals,
   * which depends on this library.
   */
  isTwoDCameraFree: boolean;
};

export type DirectCameraHandover = {
  /** true when Cesium has been placed on the 2D camera and needs no animation. */
  tryDirectTransitionToCesium: () => Promise<boolean>;
  /** true when MapLibre has been placed on the 3D camera and needs no animation. */
  tryDirectTransitionToLeaflet: () => boolean;
  /**
   * Whether the 3D->2D handover keeps bearing/pitch. The hash reducer needs this
   * before the handover runs, so it is exposed separately from the attempt.
   */
  willPreserveOrientationOnHandover: () => boolean;
};

/**
 * Direct (un-animated) camera handover between the MapLibre 2D map and Cesium.
 *
 * Both engines already subscribe to the same view state, and both adapters carry
 * bearing and pitch, so a switch is a read plus an apply. This restores the
 * behaviour the app had before the animated leaflet-shaped transition was put in
 * front of it, and is used only when the two engines can hold the same camera:
 * otherwise the caller falls back to the animated transition.
 */
export const useDirectCameraHandover = ({
  id,
  map = null,
  getScene,
  getSurfaceProvider,
  getTerrainProvider,
  maplibreBridge,
  isTwoDCameraFree,
}: UseDirectCameraHandoverOptions): DirectCameraHandover => {
  // read through refs: the switcher holds these callbacks in a ref registry and
  // must not need a re-register on every camera or restriction change
  const mapRef = useRef(map);
  mapRef.current = map;
  const isTwoDCameraFreeRef = useRef(isTwoDCameraFree);
  isTwoDCameraFreeRef.current = isTwoDCameraFree;
  const bridgeRef = useRef(maplibreBridge);
  bridgeRef.current = maplibreBridge;

  const tryDirectTransitionToCesium = useCallback(async () => {
    const currentMap = mapRef.current;
    const scene = getScene();
    if (!currentMap || !scene || scene.isDestroyed()) {
      return false;
    }

    // a flat, north-up 2D view has nothing worth preserving: let the animated
    // transition do its thing
    if (!hasOrientation(currentMap)) {
      return false;
    }

    // anchoring at sea level drops the camera below the surface and reads as a
    // wrong zoom level, so the ground has to be sampled before the state is read
    const surfaceProvider = getSurfaceProvider();
    const terrainProvider = getTerrainProvider();
    const provider = isValidCesiumTerrainProvider(surfaceProvider)
      ? surfaceProvider
      : terrainProvider;
    const altitudeM = await readGroundHeightM(currentMap, provider);

    if (scene.isDestroyed()) {
      return false;
    }

    const state = readFromMaplibre(currentMap, id, { altitudeM });
    if (!state) {
      return false;
    }

    bridgeRef.current.pushState(state, "sync");
    applyToCesium(scene, state);
    return true;
  }, [getScene, getSurfaceProvider, getTerrainProvider, id]);

  const canMaplibreHold = useCallback((currentMap: MapLibreMap, scene: Scene) => {
    const state = readFromCesium(scene, id);
    if (!state) {
      return null;
    }

    // MapLibre clamps pitch to its own maxPitch and zoom to its own bounds, so a
    // camera outside either would land somewhere else — exactly the mismatch the
    // direct path exists to avoid. Fall back to the animated transition instead.
    const { pitch } = deriveOrbitAngles(state);
    const pitchDeg = radToDegNumeric(pitch as number);
    if (!isFiniteNumber(pitchDeg) || pitchDeg > currentMap.getMaxPitch()) {
      return null;
    }

    const canvas = currentMap.getCanvas?.();
    const zoom = deriveZoom(state, canvas?.clientWidth, canvas?.clientHeight);
    if (
      !isFiniteNumber(zoom) ||
      zoom < currentMap.getMinZoom() ||
      zoom > currentMap.getMaxZoom()
    ) {
      return null;
    }

    return state;
  }, [id]);

  const willPreserveOrientationOnHandover = useCallback(() => {
    const currentMap = mapRef.current;
    const scene = getScene();
    if (!currentMap || !scene || scene.isDestroyed()) {
      return false;
    }
    if (!isTwoDCameraFreeRef.current) {
      return false;
    }
    return canMaplibreHold(currentMap, scene) !== null;
  }, [canMaplibreHold, getScene]);

  const tryDirectTransitionToLeaflet = useCallback(() => {
    const currentMap = mapRef.current;
    const scene = getScene();
    if (!currentMap || !scene || scene.isDestroyed()) {
      return false;
    }

    // the restriction wins: when 2D may not tilt, the animated nadir flight is
    // the correct behaviour
    if (!isTwoDCameraFreeRef.current) {
      return false;
    }

    const state = canMaplibreHold(currentMap, scene);
    if (!state) {
      return false;
    }

    applyToMaplibre(currentMap, state);
    return true;
  }, [canMaplibreHold, getScene]);

  return {
    tryDirectTransitionToCesium,
    tryDirectTransitionToLeaflet,
    willPreserveOrientationOnHandover,
  };
};
