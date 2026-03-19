import { isFiniteNumber } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import { maplibreAdapter } from "../adapters/maplibreAdapter";
import type { ViewState } from "./types";

export const HASH_ZOOM_CONVENTION = {
  MAPLIBRE_512: "maplibre-512",
  LEAFLET_256: "leaflet-256",
} as const;

export type HashZoomConvention =
  (typeof HASH_ZOOM_CONVENTION)[keyof typeof HASH_ZOOM_CONVENTION];

export const HASH_FOV_CONVENTION = {
  VIEW_SYNC_VERTICAL: "view-sync-vertical",
  CESIUM_LONGER_EDGE: "cesium-longer-edge",
} as const;

export type HashFovConvention =
  (typeof HASH_FOV_CONVENTION)[keyof typeof HASH_FOV_CONVENTION];

const normalizeHashZoomToCanonical = (
  zoom: number,
  convention: HashZoomConvention
): number =>
  convention === HASH_ZOOM_CONVENTION.LEAFLET_256 ? zoom - 1 : zoom;

const formatCanonicalZoomForHash = (
  zoom: number,
  convention: HashZoomConvention
): number =>
  convention === HASH_ZOOM_CONVENTION.LEAFLET_256 ? zoom + 1 : zoom;

const readLongerEdgeFovDegFromViewState = (
  viewState: Pick<ViewState, "fovVertical" | "fovHorizontal" | "fovLongerEdge">
): number | undefined => {
  if (isFiniteNumber(viewState.fovLongerEdge)) {
    return radToDegNumeric(viewState.fovLongerEdge)!;
  }

  const finiteFovs = [viewState.fovVertical, viewState.fovHorizontal].filter(
    isFiniteNumber
  ) as number[];
  if (finiteFovs.length === 0) {
    return undefined;
  }

  return radToDegNumeric(Math.max(...finiteFovs))!;
};

export const readViewStateHashNumber = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return isFiniteNumber(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const readHashParamsFromViewState = (
  viewState: ViewState | null | undefined,
  options: {
    defaultFovDeg?: number;
    maxPitchDeg?: number;
    zoomConvention?: HashZoomConvention;
    fovConvention?: HashFovConvention;
  } = {}
): Record<string, number> | null => {
  if (!viewState) {
    return null;
  }

  const params = maplibreAdapter.toHashParams(viewState, {
    ...(isFiniteNumber(options.defaultFovDeg)
      ? { defaultFovDeg: options.defaultFovDeg }
      : {}),
    ...(isFiniteNumber(options.maxPitchDeg)
      ? { maxPitchDeg: options.maxPitchDeg }
      : {}),
  });

  const fovConvention =
    options.fovConvention ?? HASH_FOV_CONVENTION.VIEW_SYNC_VERTICAL;
  const longerEdgeFovDeg =
    fovConvention === HASH_FOV_CONVENTION.CESIUM_LONGER_EDGE
      ? readLongerEdgeFovDegFromViewState(viewState)
      : undefined;

  const paramsWithFov = isFiniteNumber(longerEdgeFovDeg)
    ? {
        ...params,
        fov: longerEdgeFovDeg,
      }
    : params;

  const zoomConvention =
    options.zoomConvention ?? HASH_ZOOM_CONVENTION.MAPLIBRE_512;
  if (!isFiniteNumber(paramsWithFov.zoom)) {
    return paramsWithFov;
  }

  return {
    ...paramsWithFov,
    zoom: formatCanonicalZoomForHash(paramsWithFov.zoom, zoomConvention),
  };
};

export const readViewStateFromHashValues = (
  hashValues: Record<string, unknown>,
  options: {
    defaultFovDeg?: number;
    maxPitchDeg?: number;
    zoomConvention?: HashZoomConvention;
    fovConvention?: HashFovConvention;
  } = {}
): ViewState | null => {
  const zoomConvention =
    options.zoomConvention ?? HASH_ZOOM_CONVENTION.MAPLIBRE_512;
  const fovConvention =
    options.fovConvention ?? HASH_FOV_CONVENTION.VIEW_SYNC_VERTICAL;
  const hashZoom = readViewStateHashNumber(hashValues.zoom);
  const normalizedHashValues = isFiniteNumber(hashZoom)
    ? {
        ...hashValues,
        zoom: normalizeHashZoomToCanonical(hashZoom, zoomConvention),
      }
    : hashValues;
  const hashLongerEdgeFovDeg = readViewStateHashNumber(
    normalizedHashValues.fov
  );
  const adapterHashValues =
    fovConvention === HASH_FOV_CONVENTION.CESIUM_LONGER_EDGE &&
    isFiniteNumber(hashLongerEdgeFovDeg)
      ? (() => {
          const { fov: _ignoredFov, ...rest } = normalizedHashValues;
          return rest;
        })()
      : normalizedHashValues;

  const target = maplibreAdapter.fromHashValues(adapterHashValues, {
    ...(isFiniteNumber(options.defaultFovDeg)
      ? { defaultFovDeg: options.defaultFovDeg }
      : {}),
    ...(isFiniteNumber(options.maxPitchDeg)
      ? { maxPitchDeg: options.maxPitchDeg }
      : {}),
  });

  if (!target) {
    return null;
  }

  if (fovConvention !== HASH_FOV_CONVENTION.CESIUM_LONGER_EDGE) {
    return target;
  }

  const {
    fovVertical: _ignoredFovVertical,
    fovHorizontal: _ignoredFovHorizontal,
    ...restTarget
  } = target;

  return {
    ...restTarget,
    ...(isFiniteNumber(hashLongerEdgeFovDeg)
      ? {
          fovLongerEdge: degToRadNumeric(
            hashLongerEdgeFovDeg
          )! as ViewState["fovLongerEdge"],
        }
      : {}),
  };
};
