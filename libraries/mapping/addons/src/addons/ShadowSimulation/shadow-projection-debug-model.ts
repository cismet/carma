import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Quaternion, Vector3 } from "three";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { enuOffsetToEcef } from "@carma-geo/utils";
import {
  buildViewState,
  buildViewStateFromEcef,
  readFromMaplibre,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import type { Meters } from "@carma-units";

import type { SolarPosition } from "./solar-position";
import type { ShadowProjectionDebugSnapshot } from "./shadow-projection-debug-store";

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEBUG_SOURCE_ID = "shadow-simulation-projection-debug";

type GeographicPoint = readonly [longitude: number, latitude: number];

export type ShadowProjectionDebugTile = Readonly<{
  id: string;
  row: number;
  column: number;
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
  shadowTiles: readonly ShadowProjectionDebugTile[];
  activeShadowTileCount: number;
  shadowTilePoolSize: number;
  shadowTilePoolCapacityTexels: number;
  casterReachMeters: number;
};

export type ShadowTileCoreInsetsPercent = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const buildShadowTileCoreInsetsPercent = (
  tile: Pick<
    ShadowProjectionDebugTile,
    | "leftMeters"
    | "rightMeters"
    | "bottomMeters"
    | "topMeters"
    | "receiverLeftMeters"
    | "receiverRightMeters"
    | "receiverBottomMeters"
    | "receiverTopMeters"
  >
): ShadowTileCoreInsetsPercent => {
  const widthMeters = Math.max(
    Number.EPSILON,
    tile.rightMeters - tile.leftMeters
  );
  const heightMeters = Math.max(
    Number.EPSILON,
    tile.topMeters - tile.bottomMeters
  );

  return {
    left: clampPercent(
      ((tile.receiverLeftMeters - tile.leftMeters) / widthMeters) * 100
    ),
    right: clampPercent(
      ((tile.rightMeters - tile.receiverRightMeters) / widthMeters) * 100
    ),
    top: clampPercent(
      ((tile.topMeters - tile.receiverTopMeters) / heightMeters) * 100
    ),
    bottom: clampPercent(
      ((tile.receiverBottomMeters - tile.bottomMeters) / heightMeters) * 100
    ),
  };
};

const degreesToRadians = (value: number) => (value * Math.PI) / 180;

const isFiniteMatrix = (matrix: Matrix4) => {
  const determinant = matrix.determinant();
  return (
    matrix.elements.every(Number.isFinite) &&
    Number.isFinite(determinant) &&
    determinant !== 0
  );
};

export const buildShadowCameraViewState = ({
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
  const scenePosition = new Vector3().setFromMatrixPosition(matrixWorld);
  const relativePosition = scenePosition.sub(sceneAnchorPosition);
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
  first: GeographicPoint,
  second: GeographicPoint
) => {
  const firstLatitude = degreesToRadians(first[1]);
  const secondLatitude = degreesToRadians(second[1]);
  const latitudeDelta = secondLatitude - firstLatitude;
  const longitudeDelta = degreesToRadians(second[0] - first[0]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  );
};

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
  const widthMeters =
    (measureGeographicDistance(southWest, southEast) +
      measureGeographicDistance(northWest, northEast)) /
    2;
  const heightMeters =
    (measureGeographicDistance(southWest, northWest) +
      measureGeographicDistance(southEast, northEast)) /
    2;
  return { widthPixels, heightPixels, widthMeters, heightMeters };
};

export const buildShadowProjectionDebugModel = (
  map: MaplibreMap,
  solarPosition: SolarPosition,
  snapshot: ShadowProjectionDebugSnapshot
): ShadowProjectionDebugModel | null => {
  const cameraViewState = readFromMaplibre(map, DEBUG_SOURCE_ID);
  if (!cameraViewState) return null;

  const footprint = readViewportFootprint(map);
  const tiles = snapshot.tiledShadow?.tiles ?? [];
  const shadowLeftMeters =
    tiles.length > 0
      ? Math.min(...tiles.map(({ receiverLeftMeters }) => receiverLeftMeters))
      : snapshot.leftMeters;
  const shadowRightMeters =
    tiles.length > 0
      ? Math.max(...tiles.map(({ receiverRightMeters }) => receiverRightMeters))
      : snapshot.rightMeters;
  const shadowBottomMeters =
    tiles.length > 0
      ? Math.min(
          ...tiles.map(({ receiverBottomMeters }) => receiverBottomMeters)
        )
      : snapshot.bottomMeters;
  const shadowTopMeters =
    tiles.length > 0
      ? Math.max(...tiles.map(({ receiverTopMeters }) => receiverTopMeters))
      : snapshot.topMeters;
  const receiverCoverageWidthMeters = shadowRightMeters - shadowLeftMeters;
  const receiverCoverageHeightMeters = shadowTopMeters - shadowBottomMeters;
  const shadowTilePoolCapacityTexels =
    snapshot.tiledShadow?.totalShadowTexels ??
    snapshot.shadowMapWidth * snapshot.shadowMapHeight;
  const shadowTileTexels = Math.max(
    1,
    (tiles[0]?.shadowMapWidth ?? snapshot.shadowMapWidth) *
      (tiles[0]?.shadowMapHeight ?? snapshot.shadowMapHeight)
  );
  const shadowTilePoolSize = Math.max(
    1,
    Math.round(shadowTilePoolCapacityTexels / shadowTileTexels)
  );
  const sunCameraRangeMeters = Math.max(snapshot.cameraRangeMeters, 1);
  const azimuthDegrees =
    snapshot.atmosphericSunlight?.azimuthDegrees ??
    solarPosition.azimuthDegrees;
  const elevationDegrees =
    snapshot.atmosphericSunlight?.elevationDegrees ??
    solarPosition.elevationDegrees;
  const elevationRadians = degreesToRadians(Math.max(0.01, elevationDegrees));
  const sceneAnchorPosition = new Vector3().fromArray(
    snapshot.sceneAnchorPositionElements ?? [0, 0, 0]
  );
  const buildSunViewState = (
    projectionMatrixElements: readonly number[],
    nearMeters: number,
    farMeters: number,
    shadowMapWidth: number,
    shadowMapHeight: number,
    sourceSuffix: string
  ) =>
    buildViewState({
      longitude: cameraViewState.anchorCartographic.longitude,
      latitude: cameraViewState.anchorCartographic.latitude,
      altitude: cameraViewState.anchorCartographic.altitude,
      bearing: degreesToRadians((azimuthDegrees + 180) % 360),
      pitch: degreesToRadians(90 - elevationDegrees),
      range: sunCameraRangeMeters,
      intrinsics: {
        type: CAMERA_TYPE.ORTHOGRAPHIC,
        projectionMatrix: new Matrix4().fromArray([
          ...projectionMatrixElements,
        ]),
        frustum: {
          near: nearMeters as Meters,
          far: farMeters as Meters,
        },
      },
      metadata: {
        frameId: cameraViewState.metadata.frameId,
        timestampMs: Date.now(),
        sourceId: `${DEBUG_SOURCE_ID}-${sourceSuffix}`,
        source: "sync",
        viewport: {
          widthPx: shadowMapWidth,
          heightPx: shadowMapHeight,
        },
      },
    });
  const shadowTileViewStates = tiles.flatMap((tile) => {
    const viewState = buildShadowCameraViewState({
      referenceViewState: cameraViewState,
      sceneAnchorPosition,
      viewMatrixElements: tile.viewMatrixElements,
      projectionMatrixElements: tile.projectionMatrixElements,
      nearMeters: tile.nearMeters,
      farMeters: tile.farMeters,
      shadowMapWidth: tile.shadowMapWidth,
      shadowMapHeight: tile.shadowMapHeight,
      sourceSuffix: `sun-${tile.id}`,
    });
    return viewState ? [viewState] : [];
  });
  const sunViewStates =
    shadowTileViewStates.length > 0
      ? shadowTileViewStates
      : [
          buildSunViewState(
            snapshot.projectionMatrixElements,
            snapshot.nearMeters,
            snapshot.farMeters,
            snapshot.shadowMapWidth,
            snapshot.shadowMapHeight,
            "sun"
          ),
        ];

  return {
    viewStates: [cameraViewState, ...sunViewStates],
    viewportWidthMeters: footprint.widthMeters,
    viewportHeightMeters: footprint.heightMeters,
    receiverCoverageWidthMeters,
    receiverCoverageHeightMeters,
    shadowTexelWidthMeters:
      tiles[0]?.statistics.effectiveMetersPerTexel ??
      receiverCoverageWidthMeters / Math.max(1, snapshot.shadowMapWidth),
    shadowTexelHeightMeters:
      tiles[0]?.statistics.effectiveMetersPerTexel ??
      receiverCoverageHeightMeters / Math.max(1, snapshot.shadowMapHeight),
    horizontalProjectionPerHeight: 1 / Math.tan(elevationRadians),
    elevationSpanMeters:
      snapshot.maximumElevationMeters - snapshot.minimumElevationMeters,
    shadowTiles: tiles.map((tile) => ({
      id: tile.id,
      row: tile.row,
      column: tile.column,
      receiverLeftMeters: tile.receiverLeftMeters,
      receiverRightMeters: tile.receiverRightMeters,
      receiverBottomMeters: tile.receiverBottomMeters,
      receiverTopMeters: tile.receiverTopMeters,
      leftMeters: tile.leftMeters,
      rightMeters: tile.rightMeters,
      bottomMeters: tile.bottomMeters,
      topMeters: tile.topMeters,
      widthMeters: tile.rightMeters - tile.leftMeters,
      heightMeters: tile.topMeters - tile.bottomMeters,
      guardMeters: tile.statistics.casterGuardMeters,
      texelMeters: tile.statistics.effectiveMetersPerTexel,
      shadowMapWidth: tile.shadowMapWidth,
      shadowMapHeight: tile.shadowMapHeight,
    })),
    activeShadowTileCount: tiles.length,
    shadowTilePoolSize,
    shadowTilePoolCapacityTexels,
    casterReachMeters: snapshot.tiledShadow?.casterReachMeters ?? 0,
  };
};
