import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";
import type { SceneStateSnapshot } from "@carma/types";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
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
const HALF_PI = Math.PI * 0.5;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeBearingDeg = (bearingDeg: number): number => {
  const normalized = bearingDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

// Cesium HeadingPitchRange pitch is measured from the local EN plane:
// -PI/2 = nadir, 0 = horizon. The shared view-sync pitch uses the MapLibre-style
// orbit convention: 0 = nadir, +PI/2 = horizon.
export const toViewSyncPitchFromCesiumPitch = (
  cesiumPitch: number
): Radians => (cesiumPitch + HALF_PI) as Radians;

export const toCesiumPitchFromViewSyncPitch = (
  viewSyncPitch: number
): Radians => (viewSyncPitch - HALF_PI) as Radians;

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

const readLineOfSightDistance = (sceneState: SceneStateSnapshot): number | null => {
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
  sceneState: SceneStateSnapshot | null | undefined
): ViewSyncTargetState | null => {
  const objectCentricPose = sceneState?.camera.cameraModel?.pose;
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
    ...(isFiniteNumber(sceneState.camera.fovVertical)
      ? { fovVertical: sceneState.camera.fovVertical as Radians }
      : {}),
    ...(isFiniteNumber(sceneState.camera.fovHorizontal)
      ? { fovHorizontal: sceneState.camera.fovHorizontal as Radians }
      : {}),
    ...(isFiniteNumber(sceneState.camera.aspect)
      ? { aspect: sceneState.camera.aspect }
      : isFiniteNumber(sceneState.camera.aspectRatio)
        ? { aspect: sceneState.camera.aspectRatio }
      : {}),
    ...(isFiniteNumber(sceneState.camera.near)
      ? { near: sceneState.camera.near as Meters }
      : isFiniteNumber(sceneState.camera.nearPlane)
        ? { near: sceneState.camera.nearPlane as Meters }
      : {}),
    ...(isFiniteNumber(sceneState.camera.far)
      ? { far: sceneState.camera.far as Meters }
      : isFiniteNumber(sceneState.camera.farPlane)
        ? { far: sceneState.camera.farPlane as Meters }
      : {}),
    ...(sceneState.camera.type ? { type: sceneState.camera.type } : {}),
    ...(sceneState.camera.view ? { view: sceneState.camera.view } : {}),
    ...(sceneState.camera.cameraModel
      ? { cameraModel: sceneState.camera.cameraModel }
      : {}),
  };
};

export const projectViewSyncTargetToMapLibre = ({
  target,
  viewport,
  fovVertical,
  tileSizePx = MAPLIBRE_TILE_SIZE_PX,
  maxPitchDeg = 85,
}: {
  target: ViewSyncTargetState;
  viewport: ViewSyncViewport;
  fovVertical?: number;
  tileSizePx?: number;
  maxPitchDeg?: number;
}): ViewSyncMapLibreProjection | null => {
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
    pitch: Math.min(radToDegNumeric(target.bearingPitchRange.pitch), maxPitchDeg),
  };
};

export const projectViewSyncTargetToLeaflet = ({
  target,
  viewport,
  fovVertical,
  tileSizePx = LEAFLET_TILE_SIZE_PX,
  includeBearing = false,
}: {
  target: ViewSyncTargetState;
  viewport: ViewSyncViewport;
  fovVertical?: number;
  tileSizePx?: number;
  includeBearing?: boolean;
}): ViewSyncLeafletProjection | null => {
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

export const projectMapLibreViewToViewSyncTarget = ({
  lngDeg,
  latDeg,
  zoom,
  bearingDeg = 0,
  pitchDeg = 0,
  anchorAltitudeM,
  viewport,
  fovVertical,
  tileSizePx = MAPLIBRE_TILE_SIZE_PX,
}: {
  lngDeg: number;
  latDeg: number;
  zoom: number;
  bearingDeg?: number;
  pitchDeg?: number;
  anchorAltitudeM: number;
  viewport: ViewSyncViewport;
  fovVertical: number;
  tileSizePx?: number;
}): ViewSyncTargetState | null => {
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
          type: "PerspectiveCamera" as const,
        }
      : {
          fovVertical: fovVertical as Radians,
          type: "PerspectiveCamera" as const,
        }),
  };
};

export const projectLeafletViewToViewSyncTarget = ({
  lngDeg,
  latDeg,
  zoom,
  anchorAltitudeM,
  viewport,
  fovVertical,
  bearingDeg = 0,
  tileSizePx = LEAFLET_TILE_SIZE_PX,
}: {
  lngDeg: number;
  latDeg: number;
  zoom: number;
  anchorAltitudeM: number;
  viewport: ViewSyncViewport;
  fovVertical: number;
  bearingDeg?: number;
  tileSizePx?: number;
}): ViewSyncTargetState | null => {
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
          type: "PerspectiveCamera" as const,
        }
      : {
          fovVertical: fovVertical as Radians,
          type: "PerspectiveCamera" as const,
        }),
  };
};
