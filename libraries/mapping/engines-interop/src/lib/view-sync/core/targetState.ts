import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";
import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { isFiniteNumber, PI_OVER_TWO } from "@carma/math";
import type { SceneState } from "./sceneState";
import {
  degToRadNumeric,
  radToDegNumeric,
  zeroToThreeSixty,
} from "@carma/units/helpers";
import type { Degrees, Meters, Radians } from "@carma/units/types";
import type {
  ViewSyncLeafletProjection,
  ViewSyncMapLibreProjection,
  ViewSyncTargetState,
  ViewSyncViewport,
} from "./types";

const MAPLIBRE_TILE_SIZE_PX = 512;
const LEAFLET_TILE_SIZE_PX = 256;
const MIN_RANGE_M = 0.01;
const MIN_TAN_HALF_FOV = 1e-6;

const normalizeBearingDeg = (bearingDeg: number): number =>
  zeroToThreeSixty(bearingDeg as Degrees) as number;

// Cesium HeadingPitchRange pitch is measured from the local EN plane:
// -PI/2 = nadir, 0 = horizon. The shared view-sync pitch uses the MapLibre-style
// orbit convention: 0 = nadir, +PI/2 = horizon.
export const toViewSyncPitchFromCesiumPitch = (cesiumPitch: number): Radians =>
  (cesiumPitch + PI_OVER_TWO) as Radians;

export const toCesiumPitchFromViewSyncPitch = (
  viewSyncPitch: number
): Radians => (viewSyncPitch - PI_OVER_TWO) as Radians;

export const getHorizontalFovFromVertical = ({
  fovVertical,
  aspect,
}: {
  fovVertical: number;
  aspect: number;
}): Radians | null => {
  if (!isFiniteNumber(fovVertical) || !isFiniteNumber(aspect) || aspect <= 0) {
    return null;
  }

  return (Math.atan(Math.tan(fovVertical * 0.5) * aspect) * 2) as Radians;
};

export const getVerticalFovFromHorizontal = ({
  fovHorizontal,
  aspect,
}: {
  fovHorizontal: number;
  aspect: number;
}): Radians | null => {
  if (
    !isFiniteNumber(fovHorizontal) ||
    !isFiniteNumber(aspect) ||
    aspect <= 0
  ) {
    return null;
  }

  return (Math.atan(Math.tan(fovHorizontal * 0.5) / aspect) * 2) as Radians;
};

export const readViewSyncVerticalFov = (
  target: Pick<ViewSyncTargetState, "fovVertical" | "fovHorizontal" | "aspect">
): Radians | null => {
  if (isFiniteNumber(target.fovVertical)) {
    return target.fovVertical as Radians;
  }

  if (isFiniteNumber(target.fovHorizontal) && isFiniteNumber(target.aspect)) {
    return getVerticalFovFromHorizontal({
      fovHorizontal: target.fovHorizontal,
      aspect: target.aspect,
    });
  }

  return null;
};

export const readViewSyncHorizontalFov = (
  target: Pick<ViewSyncTargetState, "fovVertical" | "fovHorizontal" | "aspect">
): Radians | null => {
  if (isFiniteNumber(target.fovHorizontal)) {
    return target.fovHorizontal as Radians;
  }

  if (isFiniteNumber(target.fovVertical) && isFiniteNumber(target.aspect)) {
    return getHorizontalFovFromVertical({
      fovVertical: target.fovVertical,
      aspect: target.aspect,
    });
  }

  return null;
};

const readLineOfSightDistance = (sceneState: SceneState): number | null => {
  const orbitPoint = sceneState.orbitPoint?.worldPosition;
  const camera = sceneState.camera.worldPosition;
  if (!orbitPoint) {
    return null;
  }

  const distance = Math.hypot(
    camera.x - orbitPoint.x,
    camera.y - orbitPoint.y,
    camera.z - orbitPoint.z
  );
  return isFiniteNumber(distance) && distance >= MIN_RANGE_M ? distance : null;
};

const readMetersPerCssPixel = ({
  rangeM,
  fovRad,
  viewport,
}: {
  rangeM: number;
  fovRad: number;
  viewport: ViewSyncViewport;
}): number | null => {
  const centerRadiusPx = Math.max(viewport.widthPx, viewport.heightPx) * 0.5;
  if (!isFiniteNumber(centerRadiusPx) || centerRadiusPx <= 0) {
    return null;
  }

  const tanHalfFov = Math.tan(fovRad * 0.5);
  if (!isFiniteNumber(tanHalfFov) || Math.abs(tanHalfFov) < MIN_TAN_HALF_FOV) {
    return null;
  }

  const groundRadiusM = rangeM * Math.abs(tanHalfFov);
  const metersPerCssPixel = groundRadiusM / centerRadiusPx;
  return isFiniteNumber(metersPerCssPixel) && metersPerCssPixel > 0
    ? metersPerCssPixel
    : null;
};

const readRangeFromMetersPerCssPixel = ({
  metersPerCssPixel,
  fovRad,
  viewport,
}: {
  metersPerCssPixel: number;
  fovRad: number;
  viewport: ViewSyncViewport;
}): number | null => {
  const centerRadiusPx = Math.max(viewport.widthPx, viewport.heightPx) * 0.5;
  if (!isFiniteNumber(centerRadiusPx) || centerRadiusPx <= 0) {
    return null;
  }

  const tanHalfFov = Math.tan(fovRad * 0.5);
  if (!isFiniteNumber(tanHalfFov) || Math.abs(tanHalfFov) < MIN_TAN_HALF_FOV) {
    return null;
  }

  const groundRadiusM = metersPerCssPixel * centerRadiusPx;
  const rangeM = groundRadiusM / Math.abs(tanHalfFov);
  return isFiniteNumber(rangeM) && rangeM >= MIN_RANGE_M ? rangeM : null;
};

export const readViewSyncTargetFromSceneState = (
  sceneState: SceneState | null | undefined
): ViewSyncTargetState | null => {
  const objectCentricPose = sceneState?.camera.cameraModel?.pose;
  const intrinsics = sceneState?.camera.cameraModel?.intrinsics;
  // Prefer the shared object-centric camera model when present. It carries the
  // richer camera pose payload (basis / quaternion / matrices) alongside the
  // orbit-style convenience fields. Raw bearing/pitch/roll remain a fallback
  // only; near nadir those Euler-style angles can lose a stable azimuth.
  const hasObjectCentricPose =
    !!objectCentricPose &&
    !!objectCentricPose.anchor &&
    isFiniteNumber(objectCentricPose.anchor.longitude) &&
    isFiniteNumber(objectCentricPose.anchor.latitude) &&
    isFiniteNumber(objectCentricPose.anchor.altitude) &&
    isFiniteNumber(objectCentricPose.bearing) &&
    isFiniteNumber(objectCentricPose.pitch) &&
    isFiniteNumber(objectCentricPose.range);
  const anchor = hasObjectCentricPose
    ? objectCentricPose.anchor
    : sceneState?.orbitPoint?.cartographic;
  const bearing = hasObjectCentricPose
    ? objectCentricPose.bearing
    : sceneState?.camera.bearingRad;
  const pitch = hasObjectCentricPose
    ? objectCentricPose.pitch
    : isFiniteNumber(sceneState?.camera.pitchRad)
    ? toViewSyncPitchFromCesiumPitch(sceneState.camera.pitchRad)
    : sceneState?.camera.pitchRad;
  const rangeM = hasObjectCentricPose
    ? objectCentricPose.range
    : sceneState
    ? readLineOfSightDistance(sceneState)
    : null;
  const aspect =
    intrinsics?.viewOffset &&
    isFiniteNumber(intrinsics.viewOffset.width) &&
    isFiniteNumber(intrinsics.viewOffset.height) &&
    intrinsics.viewOffset.height > 0
      ? intrinsics.viewOffset.width / intrinsics.viewOffset.height
      : intrinsics?.viewOffset &&
        isFiniteNumber(intrinsics.viewOffset.fullWidth) &&
        isFiniteNumber(intrinsics.viewOffset.fullHeight) &&
        intrinsics.viewOffset.fullHeight > 0
      ? intrinsics.viewOffset.fullWidth / intrinsics.viewOffset.fullHeight
      : null;

  if (
    !anchor ||
    !isFiniteNumber(anchor.longitude) ||
    !isFiniteNumber(anchor.latitude) ||
    !isFiniteNumber(anchor.altitude) ||
    !isFiniteNumber(bearing) ||
    !isFiniteNumber(pitch) ||
    !isFiniteNumber(rangeM)
  ) {
    return null;
  }

  return {
    anchor: {
      longitude: anchor.longitude,
      latitude: anchor.latitude,
      altitude: anchor.altitude,
    },
    bearingPitchRange: {
      // Keep publishing bearing/pitch/range because downstream engines and UI
      // controls project from this compact orbit view. Treat it as a derived
      // interop surface, not as a stronger orientation source than the stored
      // cameraModel pose when full-basis comparison is needed.
      bearing: bearing as Radians,
      pitch: pitch as Radians,
      range: rangeM as Meters,
    },
    ...(isFiniteNumber(objectCentricPose?.roll)
      ? { roll: objectCentricPose.roll as Radians }
      : isFiniteNumber(sceneState.camera.rollRad)
      ? { roll: sceneState.camera.rollRad as Radians }
      : {}),
    ...(isFiniteNumber(intrinsics?.fov)
      ? { fovVertical: intrinsics.fov as Radians }
      : {}),
    ...(isFiniteNumber(intrinsics?.fovHorizontal)
      ? { fovHorizontal: intrinsics.fovHorizontal as Radians }
      : {}),
    ...(isFiniteNumber(aspect) ? { aspect } : {}),
    ...(isFiniteNumber(intrinsics?.frustum?.near)
      ? { near: intrinsics.frustum.near as Meters }
      : {}),
    ...(isFiniteNumber(intrinsics?.frustum?.far)
      ? { far: intrinsics.frustum.far as Meters }
      : {}),
    ...(intrinsics?.type ? { type: intrinsics.type } : {}),
    ...(intrinsics?.viewOffset ? { viewOffset: intrinsics.viewOffset } : {}),
    ...(sceneState.camera.cameraModel
      ? { cameraModel: sceneState.camera.cameraModel }
      : {}),
  };
};

export const projectViewSyncTargetToMapLibre = (
  target: ViewSyncTargetState,
  viewport: ViewSyncViewport,
  options: {
    fovVertical?: number;
    tileSizePx?: number;
    maxPitchDeg?: number;
  } = {}
): ViewSyncMapLibreProjection | null => {
  const {
    fovVertical,
    tileSizePx = MAPLIBRE_TILE_SIZE_PX,
    maxPitchDeg = 85,
  } = options;
  const resolvedFovVertical = fovVertical ?? readViewSyncVerticalFov(target);
  if (!isFiniteNumber(resolvedFovVertical)) {
    return null;
  }

  const metersPerCssPixel = readMetersPerCssPixel({
    rangeM: target.bearingPitchRange.range,
    fovRad: resolvedFovVertical,
    viewport,
  });
  if (!isFiniteNumber(metersPerCssPixel)) {
    return null;
  }

  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCssPixel as Meters,
    target.anchor.latitude,
    { tileSize: tileSizePx }
  );
  if (!isFiniteNumber(zoom)) {
    return null;
  }

  return {
    lng: radToDegNumeric(target.anchor.longitude),
    lat: radToDegNumeric(target.anchor.latitude),
    zoom,
    bearing: normalizeBearingDeg(
      radToDegNumeric(target.bearingPitchRange.bearing)
    ),
    pitch: Math.min(
      radToDegNumeric(target.bearingPitchRange.pitch),
      maxPitchDeg
    ),
  };
};

export const projectViewSyncTargetToLeaflet = (
  target: ViewSyncTargetState,
  viewport: ViewSyncViewport,
  options: {
    fovVertical?: number;
    tileSizePx?: number;
    includeBearing?: boolean;
  } = {}
): ViewSyncLeafletProjection | null => {
  const {
    fovVertical,
    tileSizePx = LEAFLET_TILE_SIZE_PX,
    includeBearing = false,
  } = options;
  const resolvedFovVertical = fovVertical ?? readViewSyncVerticalFov(target);
  if (!isFiniteNumber(resolvedFovVertical)) {
    return null;
  }

  const metersPerCssPixel = readMetersPerCssPixel({
    rangeM: target.bearingPitchRange.range,
    fovRad: resolvedFovVertical,
    viewport,
  });
  if (!isFiniteNumber(metersPerCssPixel)) {
    return null;
  }

  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCssPixel as Meters,
    target.anchor.latitude,
    { tileSize: tileSizePx }
  );
  if (!isFiniteNumber(zoom)) {
    return null;
  }

  return {
    center: {
      lat: radToDegNumeric(target.anchor.latitude),
      lng: radToDegNumeric(target.anchor.longitude),
    },
    zoom,
    ...(includeBearing
      ? {
          bearingDeg: normalizeBearingDeg(
            radToDegNumeric(target.bearingPitchRange.bearing)
          ),
        }
      : {}),
  };
};

export const projectMapLibreViewToViewSyncTarget = (
  lngDeg: number,
  latDeg: number,
  zoom: number,
  anchorAltitudeM: number,
  viewport: ViewSyncViewport,
  fovVertical: number,
  options: {
    bearingDeg?: number;
    pitchDeg?: number;
    tileSizePx?: number;
  } = {}
): ViewSyncTargetState | null => {
  const {
    bearingDeg = 0,
    pitchDeg = 0,
    tileSizePx = MAPLIBRE_TILE_SIZE_PX,
  } = options;
  const latitudeRad = degToRadNumeric(latDeg) as Radians;
  const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad,
    { tileSize: tileSizePx }
  );
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel,
    fovRad: fovVertical,
    viewport,
  });

  if (
    !isFiniteNumber(rangeM) ||
    !isFiniteNumber(anchorAltitudeM) ||
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg)
  ) {
    return null;
  }

  return {
    anchor: {
      longitude: degToRadNumeric(lngDeg) as Radians,
      latitude: latitudeRad,
      altitude: anchorAltitudeM as ViewSyncTargetState["anchor"]["altitude"],
    },
    bearingPitchRange: {
      bearing: degToRadNumeric(bearingDeg) as Radians,
      pitch: degToRadNumeric(pitchDeg) as Radians,
      range: rangeM as Meters,
    },
    ...(viewport.widthPx > 0 && viewport.heightPx > 0
      ? {
          aspect: viewport.widthPx / viewport.heightPx,
          fovVertical: fovVertical as Radians,
          fovHorizontal:
            getHorizontalFovFromVertical({
              fovVertical,
              aspect: viewport.widthPx / viewport.heightPx,
            }) ?? undefined,
          type: CAMERA_TYPE.PERSPECTIVE,
        }
      : {
          fovVertical: fovVertical as Radians,
          type: CAMERA_TYPE.PERSPECTIVE,
        }),
  };
};

export const projectLeafletViewToViewSyncTarget = (
  lngDeg: number,
  latDeg: number,
  zoom: number,
  anchorAltitudeM: number,
  viewport: ViewSyncViewport,
  fovVertical: number,
  options: {
    bearingDeg?: number;
    tileSizePx?: number;
  } = {}
): ViewSyncTargetState | null => {
  const { bearingDeg = 0, tileSizePx = LEAFLET_TILE_SIZE_PX } = options;
  const latitudeRad = degToRadNumeric(latDeg) as Radians;
  const metersPerCssPixel = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad,
    { tileSize: tileSizePx }
  );
  const rangeM = readRangeFromMetersPerCssPixel({
    metersPerCssPixel,
    fovRad: fovVertical,
    viewport,
  });

  if (
    !isFiniteNumber(rangeM) ||
    !isFiniteNumber(anchorAltitudeM) ||
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg)
  ) {
    return null;
  }

  return {
    anchor: {
      longitude: degToRadNumeric(lngDeg) as Radians,
      latitude: latitudeRad,
      altitude: anchorAltitudeM as ViewSyncTargetState["anchor"]["altitude"],
    },
    bearingPitchRange: {
      bearing: degToRadNumeric(bearingDeg) as Radians,
      pitch: 0 as Radians,
      range: rangeM as Meters,
    },
    ...(viewport.widthPx > 0 && viewport.heightPx > 0
      ? {
          aspect: viewport.widthPx / viewport.heightPx,
          fovVertical: fovVertical as Radians,
          fovHorizontal:
            getHorizontalFovFromVertical({
              fovVertical,
              aspect: viewport.widthPx / viewport.heightPx,
            }) ?? undefined,
          type: CAMERA_TYPE.ORTHOGRAPHIC,
        }
      : {
          fovVertical: fovVertical as Radians,
          type: CAMERA_TYPE.ORTHOGRAPHIC,
        }),
  };
};
