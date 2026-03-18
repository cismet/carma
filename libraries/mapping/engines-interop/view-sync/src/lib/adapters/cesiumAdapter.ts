import { isFiniteNumber } from "@carma/math";
import type { Meters } from "@carma/units/types";
import {
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  getPointsFromCartographicAndHeadingPitchRange,
  type SerializedCameraStateHeadingPitchRoll,
} from "@carma/cesium";
import { toCesiumPitchFromViewSyncPitch, toViewSyncPitchFromCesiumPitch } from "../core/targetState";
import type { ViewState } from "../core/types";

const MIN_CESIUM_CAMERA_RANGE_M = 0.01;

const readCameraCartographicFromViewState = (
  viewState: ViewState
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

  const points = getPointsFromCartographicAndHeadingPitchRange({
    cartographic: anchorCartographic,
    headingPitchRange: new HeadingPitchRange(
      isFiniteNumber(viewState.bearing) ? viewState.bearing : 0,
      isFiniteNumber(viewState.pitch)
        ? toCesiumPitchFromViewSyncPitch(viewState.pitch)
        : 0,
      isFiniteNumber(viewState.range)
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
    viewState: ViewState | null | undefined
  ): SerializedCameraStateHeadingPitchRoll | null {
    if (!viewState) {
      return null;
    }

    const cameraCartographic = readCameraCartographicFromViewState(viewState);
    if (!cameraCartographic) {
      return null;
    }

    const headingRad = isFiniteNumber(viewState.bearing) ? viewState.bearing : 0;
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
