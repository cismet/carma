import { isFiniteNumber, isZeroish } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import {
  HASH_ZOOM_CONVENTION,
  readHashParamsFromViewState,
  readViewStateFromHashValues,
  readViewStateHashNumber,
  type HashZoomConvention,
  type ViewState,
} from "@carma-mapping/engines-interop/view-sync";

export type CesiumViewStateHashCodecOptions = {
  defaultFovDeg?: number;
  zoomConvention?: HashZoomConvention;
};

export type CesiumViewStateHashCodec = {
  encode: (
    viewState: ViewState | null | undefined
  ) => Record<string, number> | null;
  decode: (hashValues: Record<string, unknown>) => ViewState | null;
};

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

/**
 * Creates a ViewState ↔ hash codec with Cesium conventions baked in.
 *
 * Wraps the base view-sync hash functions with:
 * - Zoom convention offset (Leaflet +1 / -1)
 * - Longer-edge FOV encode/decode (Cesium `frustum.fov` is always the
 *   longer screen axis). Strips vertical FOV and replaces with longer-edge.
 * - `defaultFovDeg` to suppress default FOV from the hash.
 */
export const createCesiumViewStateHashCodec = (
  options: CesiumViewStateHashCodecOptions = {}
): CesiumViewStateHashCodec => {
  const zoomConvention =
    options.zoomConvention ?? HASH_ZOOM_CONVENTION.MAPLIBRE_512;

  return {
    encode: (viewState) => {
      if (!viewState) {
        return null;
      }

      const params = readHashParamsFromViewState(viewState);

      // Apply zoom convention offset
      const paramsWithZoom = isFiniteNumber(params.zoom)
        ? {
            ...params,
            zoom: formatCanonicalZoomForHash(params.zoom, zoomConvention),
          }
        : params;

      // Strip the vertical-FOV that the base encode wrote — Cesium uses
      // longer-edge FOV exclusively.
      const { fov: _stripVerticalFov, ...paramsWithoutFov } = paramsWithZoom;

      const longerEdgeFovDeg = readLongerEdgeFovDegFromViewState(viewState!);
      if (!isFiniteNumber(longerEdgeFovDeg)) {
        return paramsWithoutFov;
      }

      const isDefault =
        isFiniteNumber(options.defaultFovDeg) &&
        isZeroish(longerEdgeFovDeg - options.defaultFovDeg);

      return isDefault
        ? paramsWithoutFov
        : { ...paramsWithoutFov, fov: longerEdgeFovDeg };
    },

    decode: (hashValues) => {
      // Intercept the longer-edge FOV before the base decoder sees it.
      const hashLongerEdgeFovDeg = readViewStateHashNumber(hashValues.fov);

      // Strip fov so base decoder doesn't interpret it as vertical FOV.
      const cleanedHashValues = isFiniteNumber(hashLongerEdgeFovDeg)
        ? (() => {
            const { fov: _ignored, ...rest } = hashValues;
            return rest;
          })()
        : hashValues;

      // Apply zoom convention offset before base decode
      const hashZoom = readViewStateHashNumber(cleanedHashValues.zoom);
      const normalizedHashValues = isFiniteNumber(hashZoom)
        ? {
            ...cleanedHashValues,
            zoom: normalizeHashZoomToCanonical(hashZoom, zoomConvention),
          }
        : cleanedHashValues;

      const target = readViewStateFromHashValues(normalizedHashValues);
      if (!target) {
        return null;
      }

      // Strip vertical/horizontal FOV — Cesium only uses longer-edge.
      const {
        fovVertical: _ignoredV,
        fovHorizontal: _ignoredH,
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
    },
  };
};
