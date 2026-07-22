import { MercatorCoordinate } from "maplibre-gl";

import { getFromWGS84ToUTM32 } from "@carma-geo/proj";

import type {
  CopcLineSegment,
  CopcSceneMetadata,
} from "../../../ng-topicmap-playground/src/app/pointcloud/copcLoader";
import type { PointClipSegment } from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";

import roadCenterlinesJson from "./georadar-road-centerlines.json?raw";

type LngLat = [number, number];
type RoadLine = [LngLat, LngLat];

export interface GeoradarRoadFeature {
  type: "Feature";
  properties: {
    name: string;
    shortNames: string[];
    classes: string[];
    widths: number[];
  };
  geometry: {
    type: "MultiLineString";
    coordinates: RoadLine[];
  };
}

interface GeoradarRoadCollection {
  type: "FeatureCollection";
  bbox: [number, number, number, number];
  metadata: {
    source: string;
    sourceTileJson: string;
    sourceLayer: string;
    sourceZoom: number;
    attribution: string;
    generatedAt: string;
  };
  features: GeoradarRoadFeature[];
}

export const GEORADAR_ROAD_COLLECTION = JSON.parse(
  roadCenterlinesJson
) as GeoradarRoadCollection;

export const GEORADAR_ROADS = GEORADAR_ROAD_COLLECTION.features;
export const DEFAULT_GEORADAR_ROAD = "Hochstraße";

export const findGeoradarRoad = (
  name: string
): GeoradarRoadFeature | undefined =>
  GEORADAR_ROADS.find((feature) => feature.properties.name === name);

export const getRoadSourceSegments = (name: string): CopcLineSegment[] =>
  (findGeoradarRoad(name)?.geometry.coordinates ?? []).map(
    ([start, end]) =>
      [
        getFromWGS84ToUTM32(
          start as Parameters<typeof getFromWGS84ToUTM32>[0]
        ) as [number, number],
        getFromWGS84ToUTM32(
          end as Parameters<typeof getFromWGS84ToUTM32>[0]
        ) as [number, number],
      ] satisfies CopcLineSegment
  );

export const getRoadLocalSegments = (
  name: string,
  metadata: CopcSceneMetadata
): PointClipSegment[] => {
  const origin = MercatorCoordinate.fromLngLat(metadata.centerLngLat, 0);
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const toLocal = ([lng, lat]: LngLat): [number, number] => {
    const point = MercatorCoordinate.fromLngLat([lng, lat], 0);
    return [
      (point.x - origin.x) / meterScale,
      (point.y - origin.y) / meterScale,
    ];
  };

  return (findGeoradarRoad(name)?.geometry.coordinates ?? []).map(
    ([start, end]) => {
      const [startX, startZ] = toLocal(start);
      const [endX, endZ] = toLocal(end);
      return { startX, startZ, endX, endZ };
    }
  );
};
