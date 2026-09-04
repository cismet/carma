import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Quaternion, Vector3 } from "three";

import { CAMERA_TYPE, readLocalCameraBasis } from "@carma-commons/camera/model";
import {
  distanceMeters,
  ecefToEnuOffset,
  enuOffsetToEcef,
} from "@carma-geo/utils";
import {
  buildViewState,
  buildViewStateFromEcef,
  readFromMaplibre,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { degToRadNumeric, type Meters } from "@carma-units";

import type { SolarPosition } from "../core/solar-position";
import type { ShadowProjectionDebugSnapshot } from "./shadow-projection-debug-store";

const DEBUG_SOURCE_ID = "shadow-simulation-projection-debug";

type GeographicPoint = readonly [longitude: number, latitude: number];
type DistancePoint = Parameters<typeof distanceMeters>[0];

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
  tileVolumes: readonly Readonly<{
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
    color?: string;
  }>[];
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
  visualizationWorldScaleMeters: number;
};

const isFiniteMatrix = (matrix: Matrix4) => {
  const determinant = matrix.determinant();
  return (
    matrix.elements.every(Number.isFinite) &&
    Number.isFinite(determinant) &&
    determinant !== 0
  );
};

const buildExactCameraViewState = ({
  referenceViewState,
  sceneAnchorPosition,
  cameraType,
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
  cameraType: (typeof CAMERA_TYPE)[keyof typeof CAMERA_TYPE];
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
      type: cameraType,
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
      longitude: firstLongitude,
      latitude: firstLatitude,
    } as DistancePoint,
    {
      longitude: secondLongitude,
      latitude: secondLatitude,
    } as DistancePoint
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

type RelativeTileVolume = Readonly<{
  minimum: Vector3;
  maximum: Vector3;
  loadReason?: "viewport" | "shadow";
}>;

const readRelativeTileVolumes = (
  snapshot: ShadowProjectionDebugSnapshot,
  sceneAnchorPosition: Vector3
) =>
  (snapshot.tileVolumes ?? []).map(({ minimum, maximum, loadReason }) => ({
    minimum: new Vector3(...minimum).sub(sceneAnchorPosition),
    maximum: new Vector3(...maximum).sub(sceneAnchorPosition),
    loadReason,
  }));

const readLocalCameraPosition = (viewState: ViewState) => {
  const offset = ecefToEnuOffset(viewState.cameraPosition, viewState.anchor);
  return new Vector3(offset.east, offset.up, -offset.north);
};

const readVisualizationWorldScaleMeters = (
  relativeVolumes: readonly RelativeTileVolume[],
  viewStates: readonly ViewState[]
) => {
  const maximumAbsoluteCoordinate = [
    ...relativeVolumes.flatMap(({ minimum, maximum }) => [minimum, maximum]),
    ...viewStates.map(readLocalCameraPosition),
  ].reduce(
    (maximumValue, point) =>
      Math.max(maximumValue, ...point.toArray().map(Math.abs)),
    1
  );
  return maximumAbsoluteCoordinate / 0.82;
};

const normalizeTileVolumes = (
  relativeVolumes: readonly RelativeTileVolume[],
  worldScaleMeters: number
) => {
  const scale = 1 / worldScaleMeters;
  return relativeVolumes.map(({ minimum, maximum, loadReason }) => ({
    minimum: minimum.multiplyScalar(scale).toArray() as [
      number,
      number,
      number
    ],
    maximum: maximum.multiplyScalar(scale).toArray() as [
      number,
      number,
      number
    ],
    color:
      loadReason === "viewport"
        ? "#0284c7"
        : loadReason === "shadow"
        ? "#ea580c"
        : "#64748b",
  }));
};

const withTileVolumeDepthRange = (
  cameraViewState: ViewState,
  relativeVolumes: readonly RelativeTileVolume[]
): ViewState => {
  const viewportVolumes = relativeVolumes.filter(
    ({ loadReason }) => loadReason === "viewport"
  );
  const volumes =
    viewportVolumes.length > 0 ? viewportVolumes : relativeVolumes;
  if (volumes.length === 0) return cameraViewState;

  const cameraPosition = readLocalCameraPosition(cameraViewState);
  const { forward } = readLocalCameraBasis(cameraViewState.orientation);
  const maximumDepthMeters = volumes.reduce((maximumDepth, volume) => {
    const { minimum, maximum } = volume;
    return Math.max(
      maximumDepth,
      ...[
        new Vector3(minimum.x, minimum.y, minimum.z),
        new Vector3(maximum.x, minimum.y, minimum.z),
        new Vector3(minimum.x, maximum.y, minimum.z),
        new Vector3(maximum.x, maximum.y, minimum.z),
        new Vector3(minimum.x, minimum.y, maximum.z),
        new Vector3(maximum.x, minimum.y, maximum.z),
        new Vector3(minimum.x, maximum.y, maximum.z),
        new Vector3(maximum.x, maximum.y, maximum.z),
      ].map((corner) => corner.sub(cameraPosition).dot(forward))
    );
  }, 0);
  if (!Number.isFinite(maximumDepthMeters) || maximumDepthMeters <= 0) {
    return cameraViewState;
  }

  return {
    ...cameraViewState,
    intrinsics: {
      ...cameraViewState.intrinsics,
      frustum: {
        near: 0.1 as Meters,
        far: (maximumDepthMeters * 1.02) as Meters,
      },
    },
  };
};

export const buildShadowProjectionDebugModel = (
  map: MaplibreMap,
  solarPosition: SolarPosition,
  snapshot: ShadowProjectionDebugSnapshot
): ShadowProjectionDebugModel | null => {
  const sceneAnchorPosition = new Vector3().fromArray(
    snapshot.sceneAnchorPositionElements ?? [0, 0, 0]
  );
  const initialCameraViewState = readFromMaplibre(map, DEBUG_SOURCE_ID, {
    altitudeM: sceneAnchorPosition.y,
  });
  const shadow = snapshot.shadow;
  if (!initialCameraViewState || !shadow) return null;
  const relativeTileVolumes = readRelativeTileVolumes(
    snapshot,
    sceneAnchorPosition
  );
  const exactMainCameraViewState = snapshot.mainCamera
    ? buildExactCameraViewState({
        referenceViewState: initialCameraViewState,
        sceneAnchorPosition,
        cameraType: CAMERA_TYPE.PERSPECTIVE,
        viewMatrixElements: snapshot.mainCamera.viewMatrixElements,
        projectionMatrixElements: snapshot.mainCamera.projectionMatrixElements,
        nearMeters: snapshot.mainCamera.nearMeters,
        farMeters: snapshot.mainCamera.farMeters,
        shadowMapWidth: snapshot.mainCamera.viewportWidth,
        shadowMapHeight: snapshot.mainCamera.viewportHeight,
        sourceSuffix: "main",
      })
    : null;
  const cameraViewState = withTileVolumeDepthRange(
    exactMainCameraViewState ?? initialCameraViewState,
    relativeTileVolumes
  );

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
  const shadowViewState = buildExactCameraViewState({
    referenceViewState: cameraViewState,
    sceneAnchorPosition,
    cameraType: CAMERA_TYPE.ORTHOGRAPHIC,
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
  const resolvedShadowViewState = shadowViewState ?? fallbackShadowViewState;
  const visualizationWorldScaleMeters = readVisualizationWorldScaleMeters(
    relativeTileVolumes,
    [cameraViewState, resolvedShadowViewState]
  );

  return {
    viewStates: [cameraViewState, resolvedShadowViewState],
    tileVolumes: normalizeTileVolumes(
      relativeTileVolumes,
      visualizationWorldScaleMeters
    ),
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
    visualizationWorldScaleMeters,
  };
};
