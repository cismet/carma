import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4 } from "three";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import {
  buildViewState,
  readFromMaplibre,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import type { Meters } from "@carma-units";

import type { SolarPosition } from "./solar-position";
import type { ShadowProjectionDebugSnapshot } from "./shadow-projection-debug-store";

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEBUG_SOURCE_ID = "shadow-simulation-projection-debug";

type GeographicPoint = readonly [longitude: number, latitude: number];

export type ShadowProjectionDebugModel = {
  viewStates: readonly [camera: ViewState, sun: ViewState];
  viewportWidthMeters: number;
  viewportHeightMeters: number;
  shadowWidthMeters: number;
  shadowHeightMeters: number;
  shadowTexelWidthMeters: number;
  shadowTexelHeightMeters: number;
  horizontalProjectionPerHeight: number;
  elevationSpanMeters: number;
};

const degreesToRadians = (value: number) => (value * Math.PI) / 180;

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
  const shadowWidthMeters = snapshot.rightMeters - snapshot.leftMeters;
  const shadowHeightMeters = snapshot.topMeters - snapshot.bottomMeters;
  const sunCameraRangeMeters = Math.max(snapshot.cameraRangeMeters, 1);
  const elevationRadians = degreesToRadians(
    Math.max(0.01, solarPosition.elevationDegrees)
  );
  const sunViewState = buildViewState({
    longitude: cameraViewState.anchorCartographic.longitude,
    latitude: cameraViewState.anchorCartographic.latitude,
    altitude: cameraViewState.anchorCartographic.altitude,
    bearing: degreesToRadians((solarPosition.azimuthDegrees + 180) % 360),
    pitch: degreesToRadians(90 - solarPosition.elevationDegrees),
    range: sunCameraRangeMeters,
    intrinsics: {
      type: CAMERA_TYPE.ORTHOGRAPHIC,
      projectionMatrix: new Matrix4().fromArray([
        ...snapshot.projectionMatrixElements,
      ]),
      frustum: {
        near: snapshot.nearMeters as Meters,
        far: snapshot.farMeters as Meters,
      },
    },
    metadata: {
      frameId: cameraViewState.metadata.frameId,
      timestampMs: Date.now(),
      sourceId: `${DEBUG_SOURCE_ID}-sun`,
      source: "sync",
      viewport: {
        widthPx: snapshot.shadowMapWidth,
        heightPx: snapshot.shadowMapHeight,
      },
    },
  });

  return {
    viewStates: [cameraViewState, sunViewState],
    viewportWidthMeters: footprint.widthMeters,
    viewportHeightMeters: footprint.heightMeters,
    shadowWidthMeters,
    shadowHeightMeters,
    shadowTexelWidthMeters:
      shadowWidthMeters / Math.max(1, snapshot.shadowMapWidth),
    shadowTexelHeightMeters:
      shadowHeightMeters / Math.max(1, snapshot.shadowMapHeight),
    horizontalProjectionPerHeight: 1 / Math.tan(elevationRadians),
    elevationSpanMeters:
      snapshot.maximumElevationMeters - snapshot.minimumElevationMeters,
  };
};
