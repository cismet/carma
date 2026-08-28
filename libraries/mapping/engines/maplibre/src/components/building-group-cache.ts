import { MercatorCoordinate } from "maplibre-gl";

import {
  geographicBoundsIntersect,
  getGeographicRingBounds,
  padGeographicBounds,
  type GeographicBounds,
  unionGeographicBounds,
} from "@carma-geo/helpers";
import type { Lod2RoofFace } from "@carma-mapping/engines/threejs";

type BuildingSourceSnapshot = Readonly<{
  id: string | number | undefined;
  properties: Record<string, unknown>;
  source: string;
  sourceLayer: string;
}>;

export type CachedBuildingGroup = {
  fragments: number[][][];
  height: number;
  zGround: number;
  roofFaces?: Lod2RoofFace[];
  isPublic: boolean;
  roofColor: string | null;
  wallColor: string | null;
  sourceFeature: BuildingSourceSnapshot;
  bounds: GeographicBounds;
};

const BUILDING_CACHE_VIEWPORT_PADDING = 0.1;

export const getFootprintRadiusMeters = (
  ring: number[][],
  longitude: number,
  latitude: number
): number => {
  const center = MercatorCoordinate.fromLngLat([longitude, latitude], 0);
  const mercatorUnitsPerMeter = center.meterInMercatorCoordinateUnits();
  let radiusMeters = 0;

  for (const [pointLongitude, pointLatitude] of ring) {
    const point = MercatorCoordinate.fromLngLat(
      [pointLongitude, pointLatitude],
      0
    );
    radiusMeters = Math.max(
      radiusMeters,
      Math.hypot(point.x - center.x, point.y - center.y) / mercatorUnitsPerMeter
    );
  }

  return radiusMeters;
};

export const getRingBounds = (ring: number[][]): GeographicBounds =>
  getGeographicRingBounds(ring as [number, number][]);

export const mergeGeographicBounds = unionGeographicBounds;

export const retainBuildingGroupsInView = (
  cache: Map<string | number, CachedBuildingGroup>,
  queried: ReadonlyMap<string | number, CachedBuildingGroup>,
  viewportBounds: GeographicBounds,
  padding = BUILDING_CACHE_VIEWPORT_PADDING
): void => {
  for (const [id, next] of queried) {
    const previous = cache.get(id);
    if (!previous) {
      cache.set(id, next);
      continue;
    }
    const fragmentKeys = new Set(
      previous.fragments.map((fragment) => JSON.stringify(fragment))
    );
    const fragments = [...previous.fragments];
    for (const fragment of next.fragments) {
      const key = JSON.stringify(fragment);
      if (fragmentKeys.has(key)) continue;
      fragmentKeys.add(key);
      fragments.push(fragment);
    }
    cache.set(id, {
      ...next,
      fragments,
      bounds: mergeGeographicBounds(previous.bounds, next.bounds),
      roofFaces: next.roofFaces?.length ? next.roofFaces : previous.roofFaces,
    });
  }

  const retainedBounds = padGeographicBounds(
    viewportBounds,
    Math.max(0, padding)
  );
  for (const [id, group] of cache) {
    if (!geographicBoundsIntersect(group.bounds, retainedBounds)) {
      cache.delete(id);
    }
  }
};
