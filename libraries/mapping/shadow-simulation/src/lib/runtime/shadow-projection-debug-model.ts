import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Quaternion, Vector3 } from "three";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import type { LatLng } from "@carma-geo/data-structures";
import { distanceMeters, enuOffsetToEcef } from "@carma-geo/utils";
import {
  buildViewState,
  buildViewStateFromEcef,
  readFromMaplibre,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { degToRadNumeric, type Degrees, type Meters } from "@carma-units";

import type { SolarPosition } from "../core/solar-position";
import type { ShadowProjectionDebugSnapshot } from "./shadow-projection-debug-store";

const DEBUG_SOURCE_ID = "shadow-simulation-projection-debug";

type GeographicPoint = readonly [longitude: number, latitude: number];

export type ShadowProjectionDebugBuffer = Readonly<{
  receiverLeftMeters: number;
  receiverRightMeters: number;
  receiverBottomMeters: number;
  receiverTopMeters: number;
  leftMeters: number;
  rightMeters: number;
  bottomMeters: number;
  topMeters: number;
  widthMeters: number;
  heightMeters: number;
  guardMeters: number;
  texelMeters: number;
  shadowMapWidth: number;
  shadowMapHeight: number;
}>;

export type ShadowProjectionDebugModel = {
  viewStates: readonly ViewState[];
  viewportWidthMeters: number;
  viewportHeightMeters: number;
  receiverCoverageWidthMeters: number;
  receiverCoverageHeightMeters: number;
  shadowTexelWidthMeters: number;
  shadowTexelHeightMeters: number;
  horizontalProjectionPerHeight: number;
  elevationSpanMeters: number;
  shadowBuffer: ShadowProjectionDebugBuffer;
  shadowSampleCount: number;
  totalShadowTexels: number;
  casterReachMeters: number;
};

const isFiniteMatrix = (matrix: Matrix4) => {
  const determinant = matrix.determinant();
  return (
    matrix.elements.every(Number.isFinite) &&
    Number.isFinite(determinant) &&
    determinant !== 0
  );
};

const buildShadowCameraViewState = ({
  referenceViewState,
  sceneAnchorPosition,
  viewMatrixElements,
  projectionMatrixElements,
  nearMeters,
  farMeters,
  shadowMapWidth,
  shadowMapHeight,
  sourceSuffix,
}: {
  referenceViewState: ViewState;
  sceneAnchorPosition: Vector3;
  viewMatrixElements: readonly number[];
  projectionMatrixElements: readonly number[];
  nearMeters: number;
  farMeters: number;
  shadowMapWidth: number;
  shadowMapHeight: number;
  sourceSuffix: string;
}): ViewState | null => {
  if (
    viewMatrixElements.length !== 16 ||
    projectionMatrixElements.length !== 16
  ) {
    return null;
  }
  const viewMatrix = new Matrix4().fromArray([...viewMatrixElements]);
  const projectionMatrix = new Matrix4().fromArray([
    ...projectionMatrixElements,
  ]);
  if (!isFiniteMatrix(viewMatrix) || !isFiniteMatrix(projectionMatrix)) {
    return null;
  }
  const matrixWorld = viewMatrix.clone().invert();
  const relativePosition = new Vector3()
    .setFromMatrixPosition(matrixWorld)
    .sub(sceneAnchorPosition);
  const cameraPosition = enuOffsetToEcef(
    relativePosition.x,
    -relativePosition.z,
    relativePosition.y,
    referenceViewState.anchor
  );
  const orientation = new Quaternion()
    .setFromRotationMatrix(matrixWorld)
    .normalize();

  return buildViewStateFromEcef({
    anchor: referenceViewState.anchor.clone(),
    cameraPosition,
    orientation,
    intrinsics: {
      type: CAMERA_TYPE.ORTHOGRAPHIC,
      projectionMatrix,
      frustum: {
        near: nearMeters as Meters,
        far: farMeters as Meters,
      },
    },
    metadata: {
      frameId: referenceViewState.metadata.frameId,
      timestampMs: Date.now(),
      sourceId: `${DEBUG_SOURCE_ID}-${sourceSuffix}`,
      source: "sync",
      viewport: {
        widthPx: shadowMapWidth,
        heightPx: shadowMapHeight,
      },
    },
  });
};

const measureGeographicDistance = (
  [firstLongitude, firstLatitude]: GeographicPoint,
  [secondLongitude, secondLatitude]: GeographicPoint
) =>
  distanceMeters(
    {
      longitude: firstLongitude as Degrees,
      latitude: firstLatitude as Degrees,
    } satisfies LatLng.deg,
    {
      longitude: secondLongitude as Degrees,
      latitude: secondLatitude as Degrees,
    } satisfies LatLng.deg
  );

const readViewportFootprint = (map: MaplibreMap) => {
  const canvas = map.getCanvas();
  const widthPixels = Math.max(1, canvas.clientWidth || canvas.width);
  const heightPixels = Math.max(1, canvas.clientHeight || canvas.height);
  const [southWest, northWest, southEast, northEast] = [
    [0, heightPixels],
    [0, 0],
    [widthPixels, heightPixels],
    [widthPixels, 0],
  ].map((point) => {
    const lngLat = map.unproject(point as [number, number]);
    return [lngLat.lng, lngLat.lat] as GeographicPoint;
  });
  return {
    widthMeters:
      (measureGeographicDistance(southWest, southEast) +
        measureGeographicDistance(northWest, northEast)) /
      2,
    heightMeters:
      (measureGeographicDistance(southWest, northWest) +
        measureGeographicDistance(southEast, northEast)) /
      2,
  };
};

export const buildShadowProjectionDebugModel = (
  map: MaplibreMap,
  solarPosition: SolarPosition,
  snapshot: ShadowProjectionDebugSnapshot
): ShadowProjectionDebugModel | null => {
  const cameraViewState = readFromMaplibre(map, DEBUG_SOURCE_ID);
  const shadow = snapshot.shadow;
  if (!cameraViewState || !shadow) return null;

  const footprint = readViewportFootprint(map);
  const camera = shadow.camera;
  const receiverCoverageWidthMeters =
    camera.receiverRightMeters - camera.receiverLeftMeters;
  const receiverCoverageHeightMeters =
    camera.receiverTopMeters - camera.receiverBottomMeters;
  const azimuthDegrees =
    snapshot.atmosphericSunlight?.azimuthDegrees ??
    solarPosition.azimuthDegrees;
  const elevationDegrees =
    snapshot.atmosphericSunlight?.elevationDegrees ??
    solarPosition.elevationDegrees;
  const elevationRadians = degToRadNumeric(Math.max(0.01, elevationDegrees));
  const sceneAnchorPosition = new Vector3().fromArray(
    snapshot.sceneAnchorPositionElements ?? [0, 0, 0]
  );
  const shadowViewState = buildShadowCameraViewState({
    referenceViewState: cameraViewState,
    sceneAnchorPosition,
    viewMatrixElements: camera.viewMatrixElements,
    projectionMatrixElements: camera.projectionMatrixElements,
    nearMeters: camera.nearMeters,
    farMeters: camera.farMeters,
    shadowMapWidth: camera.shadowMapWidth,
    shadowMapHeight: camera.shadowMapHeight,
    sourceSuffix: "sun",
  });
  const fallbackShadowViewState = buildViewState({
    longitude: cameraViewState.anchorCartographic.longitude,
    latitude: cameraViewState.anchorCartographic.latitude,
    altitude: cameraViewState.anchorCartographic.altitude,
    bearing: degToRadNumeric((azimuthDegrees + 180) % 360),
    pitch: degToRadNumeric(90 - elevationDegrees),
    range: Math.max(snapshot.cameraRangeMeters, 1),
    intrinsics: {
      type: CAMERA_TYPE.ORTHOGRAPHIC,
      projectionMatrix: new Matrix4().fromArray([
        ...camera.projectionMatrixElements,
      ]),
      frustum: {
        near: camera.nearMeters as Meters,
        far: camera.farMeters as Meters,
      },
    },
    metadata: {
      frameId: cameraViewState.metadata.frameId,
      timestampMs: Date.now(),
      sourceId: `${DEBUG_SOURCE_ID}-sun`,
      source: "sync",
      viewport: {
        widthPx: camera.shadowMapWidth,
        heightPx: camera.shadowMapHeight,
      },
    },
  });

  return {
    viewStates: [cameraViewState, shadowViewState ?? fallbackShadowViewState],
    viewportWidthMeters: footprint.widthMeters,
    viewportHeightMeters: footprint.heightMeters,
    receiverCoverageWidthMeters,
    receiverCoverageHeightMeters,
    shadowTexelWidthMeters: camera.metersPerTexel,
    shadowTexelHeightMeters: camera.metersPerTexel,
    horizontalProjectionPerHeight: 1 / Math.tan(elevationRadians),
    elevationSpanMeters:
      snapshot.maximumElevationMeters - snapshot.minimumElevationMeters,
    shadowBuffer: {
      receiverLeftMeters: camera.receiverLeftMeters,
      receiverRightMeters: camera.receiverRightMeters,
      receiverBottomMeters: camera.receiverBottomMeters,
      receiverTopMeters: camera.receiverTopMeters,
      leftMeters: camera.leftMeters,
      rightMeters: camera.rightMeters,
      bottomMeters: camera.bottomMeters,
      topMeters: camera.topMeters,
      widthMeters: camera.rightMeters - camera.leftMeters,
      heightMeters: camera.topMeters - camera.bottomMeters,
      guardMeters: camera.guardMeters,
      texelMeters: camera.metersPerTexel,
      shadowMapWidth: camera.shadowMapWidth,
      shadowMapHeight: camera.shadowMapHeight,
    },
    shadowSampleCount: shadow.sampleCount,
    totalShadowTexels: shadow.totalShadowTexels,
    casterReachMeters: shadow.casterReachMeters,
  };
};
