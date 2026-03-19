import { isFiniteNumber } from "@carma/math";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import type { Meters } from "@carma/units/types";
import {
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  getPointsFromCartographicAndHeadingPitchRange,
  type SerializedCameraStateHeadingPitchRoll,
} from "@carma/cesium";
import type { SceneLike } from "@carma-mapping/engines/cesium/api";
import {
  readViewSyncLongerEdgeFov,
  toCesiumPitchFromViewSyncPitch,
  toViewSyncPitchFromCesiumPitch,
} from "../core/targetState";
import { readRangeFromMetersPerCssPixel } from "./sharedProjection";
import type { ViewState } from "../core/types";

const MIN_CESIUM_CAMERA_RANGE_M = 0.01;
const LEAFLET_DISPLAY_TILE_SIZE_PX = 256;

const readCameraCartographicFromViewState = (
  viewState: ViewState,
  scene?: SceneLike | null
): Cartographic | null => {
  if (
    !isFiniteNumber(viewState.longitude) ||
    !isFiniteNumber(viewState.latitude) ||
    !isFiniteNumber(viewState.altitude)
  ) {
    return null;
  }

  const anchorCartographic = Cartographic.fromRadians(
    viewState.longitude,
    viewState.latitude,
    viewState.altitude
  );

  const effectiveRangeM =
    isFiniteNumber(viewState.zoom) && isFiniteNumber(viewState.latitude)
      ? readRangeFromMetersPerCssPixel({
          metersPerCssPixel: getPixelResolutionFromZoomAtLatitudeRad(
            viewState.zoom + 1,
            viewState.latitude,
            { tileSize: LEAFLET_DISPLAY_TILE_SIZE_PX }
          ),
          fovRad: readViewSyncLongerEdgeFov(viewState) ?? 0,
          minRangeM: MIN_CESIUM_CAMERA_RANGE_M,
          viewportWidthPx: scene?.canvas?.clientWidth,
          viewportHeightPx: scene?.canvas?.clientHeight,
        })
      : null;

  const points = getPointsFromCartographicAndHeadingPitchRange({
    cartographic: anchorCartographic,
    headingPitchRange: new HeadingPitchRange(
      isFiniteNumber(viewState.bearing) ? viewState.bearing : 0,
      isFiniteNumber(viewState.pitch)
        ? toCesiumPitchFromViewSyncPitch(viewState.pitch)
        : 0,
      isFiniteNumber(effectiveRangeM)
        ? Math.max(MIN_CESIUM_CAMERA_RANGE_M, effectiveRangeM)
        : isFiniteNumber(viewState.range)
        ? Math.max(MIN_CESIUM_CAMERA_RANGE_M, viewState.range)
        : MIN_CESIUM_CAMERA_RANGE_M
    ),
  });

  if (!points) {
    return anchorCartographic;
  }

  return (
    Ellipsoid.WGS84.cartesianToCartographic(
      points.cameraPositionECEF,
      new Cartographic()
    ) ?? anchorCartographic
  );
};

export const cesiumAdapter = {
  toFramework(
    viewState: ViewState | null | undefined,
    options: {
      scene?: SceneLike | null;
    } = {}
  ): SerializedCameraStateHeadingPitchRoll | null {
    if (!viewState) {
      return null;
    }

    const cameraCartographic = readCameraCartographicFromViewState(
      viewState,
      options.scene
    );
    if (!cameraCartographic) {
      return null;
    }

    const headingRad = isFiniteNumber(viewState.bearing)
      ? viewState.bearing
      : 0;
    const pitchRad = isFiniteNumber(viewState.pitch)
      ? toCesiumPitchFromViewSyncPitch(viewState.pitch)
      : 0;

    if (!isFiniteNumber(headingRad) || !isFiniteNumber(pitchRad)) {
      return null;
    }

    return {
      longitude:
        cameraCartographic.longitude as SerializedCameraStateHeadingPitchRoll["longitude"],
      latitude:
        cameraCartographic.latitude as SerializedCameraStateHeadingPitchRoll["latitude"],
      altitude:
        cameraCartographic.height as SerializedCameraStateHeadingPitchRoll["altitude"],
      heading: headingRad as SerializedCameraStateHeadingPitchRoll["heading"],
      pitch: pitchRad as SerializedCameraStateHeadingPitchRoll["pitch"],
      ...(isFiniteNumber(viewState.roll)
        ? {
            roll: viewState.roll as SerializedCameraStateHeadingPitchRoll["roll"],
          }
        : {}),
      ...(isFiniteNumber(viewState.fovVertical)
        ? {
            fov: viewState.fovVertical as SerializedCameraStateHeadingPitchRoll["fov"],
          }
        : {}),
    };
  },

  toCarmaViewState(
    view: SerializedCameraStateHeadingPitchRoll | null | undefined
  ): ViewState | null {
    if (!view) {
      return null;
    }

    if (
      !isFiniteNumber(view.longitude) ||
      !isFiniteNumber(view.latitude) ||
      !isFiniteNumber(view.altitude) ||
      !isFiniteNumber(view.heading) ||
      !isFiniteNumber(view.pitch)
    ) {
      return null;
    }

    return {
      longitude: view.longitude as ViewState["longitude"],
      latitude: view.latitude as ViewState["latitude"],
      altitude: view.altitude as ViewState["altitude"],
      bearing: view.heading as ViewState["bearing"],
      pitch: toViewSyncPitchFromCesiumPitch(view.pitch) as ViewState["pitch"],
      ...(isFiniteNumber(view.roll)
        ? { roll: view.roll as ViewState["roll"] }
        : {}),
      range: MIN_CESIUM_CAMERA_RANGE_M as Meters,
      ...(isFiniteNumber(view.fov)
        ? { fovVertical: view.fov as ViewState["fovVertical"] }
        : {}),
    };
  },
};
