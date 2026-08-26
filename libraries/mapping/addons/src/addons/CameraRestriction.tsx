import { useEffect, useMemo, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { carma as carmaApi } from "@carma-api";
import { setCameraRestrictionOverride } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../lib/registry";
import { use3dLayers } from "../lib/use3dLayers";

/**
 * Decides whether the MapLibre camera is locked north-up and flat, and takes
 * that decision over from the host app for as long as the route is open.
 *
 * Declaring the addon is the whole wiring: it writes its result as the map's
 * camera-restriction override, which the engine applies and publishes, so map
 * controls follow it without the app knowing this addon exists. On unmount the
 * override is dropped and the app's own value applies again. What the app marks
 * as forced (print, and anything else that depends on a locked camera) is not
 * overridable, so no configuration here can unlock it.
 *
 * The rules compose in one direction: `mode` decides the baseline, the zoom
 * thresholds can only add a restriction on top of it. `{ mode: "never",
 * restrictBelowZoom: 14 }` therefore reads as "tilt allowed, but only once
 * zoomed in", which is what the thresholds exist for.
 *
 * Layers are read through the carma api (`carma.mapping2D`), so the addon knows
 * nothing about the host's store or its state shape.
 *
 * `unless3dLayersActive` needs no `layers` at all: it asks the map whether it
 * is drawing anything three dimensional, which covers vector buildings, trees
 * and tilesets alike and does not go stale when a new 3D style appears under a
 * name nobody thought to list.
 */

export type CameraRestrictionConfig = {
  /**
   * The baseline. "always" locks the camera for the whole route, "never" leaves
   * it free, the layer modes follow the layer stack, and "unless3dLayersActive"
   * follows the 3D layers actually on the map. Default: "always".
   */
  mode?:
    | "always"
    | "never"
    | "whileLayersActive"
    | "unlessLayersActive"
    | "unless3dLayersActive";
  layers?: string[];
  requireVisible?: boolean;
  restrictBelowZoom?: number;
  restrictAboveZoom?: number;
  maxPitch?: number;
};

const hasMatchingLayer = (
  carma: typeof carmaApi,
  patterns: string[],
  requireVisible: boolean
): boolean =>
  carma.mapping2D.getLayerIDs().some((id) => {
    if (!patterns.some((pattern) => id.toLowerCase().includes(pattern))) {
      return false;
    }
    // `null` means "not on the map", which getLayerIDs already ruled out
    return requireVisible
      ? carma.mapping2D.getLayerVisibility(id) === true
      : true;
  });

const useLayerMatch = (
  carma: typeof carmaApi,
  map: MaplibreMap | null,
  enabled: boolean,
  patterns: string[],
  requireVisible: boolean
): boolean => {
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setMatched(false);
      return;
    }
    // cheap enough for `styledata`: an id scan, and React drops equal writes
    const check = () =>
      setMatched(hasMatchingLayer(carma, patterns, requireVisible));
    check();
    if (!map) {
      return;
    }
    map.on("styledata", check);
    map.on("idle", check);
    return () => {
      map.off("styledata", check);
      map.off("idle", check);
    };
  }, [carma, map, enabled, patterns, requireVisible]);

  return matched;
};

const useZoom = (map: MaplibreMap | null, enabled: boolean): number | null => {
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    if (!map || !enabled) {
      setZoom(null);
      return;
    }
    const publish = () => setZoom(map.getZoom());
    publish();
    map.on("zoomend", publish);
    return () => {
      map.off("zoomend", publish);
    };
  }, [map, enabled]);

  return zoom;
};

/**
 * How far the addon lets the camera tilt once it decides the view is free:
 * 5 degrees above the horizon. MapLibre's stock cap of 60 stays the base for
 * maps without this addon; a config `maxPitch` still overrides.
 */
const ADDON_UNRESTRICTED_MAX_PITCH = 85;

export const CameraRestriction = ({
  carma,
  config,
  libreMap,
}: AddonComponentProps<"cameraRestriction">) => {
  const {
    mode = "always",
    layers,
    requireVisible = true,
    restrictBelowZoom,
    restrictAboveZoom,
    maxPitch = ADDON_UNRESTRICTED_MAX_PITCH,
  } = config ?? {};

  const usesLayers =
    mode === "whileLayersActive" || mode === "unlessLayersActive";
  const usesZoom =
    restrictBelowZoom !== undefined || restrictAboveZoom !== undefined;

  const zoom = useZoom(libreMap, usesZoom);

  // key on the content: route configs pass a fresh array per render
  const patternKey = (layers ?? []).map((id) => id.toLowerCase()).join(" ");
  const patterns = useMemo(
    () => (patternKey ? patternKey.split(" ") : []),
    [patternKey]
  );

  const layerActive = useLayerMatch(
    carma,
    libreMap,
    usesLayers,
    patterns,
    requireVisible
  );

  const threeDActive = use3dLayers(libreMap, mode === "unless3dLayersActive");

  let restricted: boolean;
  switch (mode) {
    case "never":
      restricted = false;
      break;
    case "whileLayersActive":
      restricted = layerActive;
      break;
    case "unlessLayersActive":
      restricted = !layerActive;
      break;
    case "unless3dLayersActive":
      restricted = !threeDActive;
      break;
    default:
      restricted = true;
  }
  // thresholds only add a restriction, they never lift one
  if (zoom !== null) {
    if (restrictBelowZoom !== undefined && zoom < restrictBelowZoom) {
      restricted = true;
    }
    if (restrictAboveZoom !== undefined && zoom >= restrictAboveZoom) {
      restricted = true;
    }
  }

  useEffect(() => {
    if (!libreMap) {
      return;
    }
    setCameraRestrictionOverride(libreMap, { restricted, maxPitch });
    return () => {
      setCameraRestrictionOverride(libreMap, null);
    };
  }, [libreMap, restricted, maxPitch]);

  return null;
};
