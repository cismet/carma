import type { Feature, FeatureCollection, Polygon, Position } from "geojson";

import type { PointWithSector } from "../../core/types";
import { wgs84ToDatasetXY, type DatasetConverter } from "../../core/utils/imageRecord";
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

/** where the two diagonals of a quadrilateral cross, planar */
const diagonalIntersection = (
  p0: Position,
  p1: Position,
  p2: Position,
  p3: Position
): [number, number] | null => {
  const [x1, y1] = p0;
  const [x2, y2] = p2;
  const [x3, y3] = p1;
  const [x4, y4] = p3;
  const denominator = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denominator === 0) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
  return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
};

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
