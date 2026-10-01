import type { Feature, FeatureCollection, Polygon } from "geojson";

import { diagonalIntersection } from "../../core/utils/footprint-diagonal-intersection";
import type { PointWithSector } from "../../core/types";
import {
  wgs84ToDatasetXY,
  type DatasetConverter,
} from "../../core/utils/imageRecord";
import { getCardinalDirection } from "../../core/utils/orientation";

/**
 * The footprints file: one polygon per image, its id in `FILENAME` and the
 * sector it was flown in under `ORI`.
 */

export type FootprintProperties = {
  FILENAME: string;
  ORI?: string;
  [key: string]: string | number | boolean | undefined;
};

export type FootprintFeature = Feature<Polygon, FootprintProperties>;
export type FootprintCollection = FeatureCollection<
  Polygon,
  FootprintProperties
>;

const ORIENTATION_PROPERTY_NAME = "ORI";
const ID_PROPERTY_NAME = "FILENAME";

export const fetchGeoJson = async (
  url: string
): Promise<FootprintCollection> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`footprints: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as FootprintCollection;
};

export const findMatchingFeature = (
  features: readonly FootprintFeature[],
  imageId: string
): FootprintFeature | undefined =>
  features.find((feature) => feature.properties[ID_PROPERTY_NAME] === imageId);

const toPointWithSector = (
  feature: FootprintFeature,
  converter: DatasetConverter
): PointWithSector | null => {
  const ring = feature.geometry.coordinates[0];
  const id = feature.properties[ID_PROPERTY_NAME];
  const cardinal = getCardinalDirection(
    feature.properties[ORIENTATION_PROPERTY_NAME]
  );
  if (!id || !ring || ring.length !== 5) {
    console.warn("[OBLIQUE] footprint without a closed 4-corner ring", feature);
    return null;
  }
  const center = diagonalIntersection(ring[0], ring[1], ring[2], ring[3]);
  if (!center) return null;
  const [x, y] = wgs84ToDatasetXY(converter, center[0], center[1]);
  return { id, cardinal, x, y, longitude: center[0], latitude: center[1] };
};

export const getFootprintCenterpoints = (
  geojson: FootprintCollection,
  converter: DatasetConverter
): PointWithSector[] =>
  geojson.features
    .map((feature) => toPointWithSector(feature, converter))
    .filter((point): point is PointWithSector => point !== null);
