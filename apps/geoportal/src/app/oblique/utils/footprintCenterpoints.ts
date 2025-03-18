import { Proj4Converter, PointWithSector } from "../types";
import { lineString, lineIntersect } from "@turf/turf";
import { getCardinalDirection } from "./orientationUtils";
import type { Feature, FeatureCollection, Polygon } from "geojson";

const ORIENTATION_PROPERTY_NAME = "ORI";
const ID_PROPERTY_NAME = "FILENAME";

const toPointWithSector = (
  feature: Feature<Polygon>,
  { converter }: Proj4Converter
): PointWithSector => {
  const ring = feature.geometry.coordinates[0];
  const id = feature.properties[ID_PROPERTY_NAME];
  const cardinal = getCardinalDirection(
    feature.properties[ORIENTATION_PROPERTY_NAME]
  );
  if (ring.length !== 5) {
    console.warn("Invalid footprint coordinates", feature);
    return {
      id,
      cardinal,
      x: 0,
      y: 0,
      longitude: 0,
      latitude: 0,
    };
  }
  const diagonalA = lineString([ring[0], ring[2]]);
  const diagonalB = lineString([ring[1], ring[3]]);
  const intersection = lineIntersect(diagonalA, diagonalB);
  const coordinates = intersection.features[0].geometry.coordinates;
  const [x, y] = converter.inverse(coordinates);

  return {
    id,
    cardinal,
    x,
    y,
    longitude: coordinates[0],
    latitude: coordinates[1],
  };
};

export const getFootprintCenterpoints = (
  geojson: FeatureCollection<Polygon>,
  converter: Proj4Converter
): PointWithSector[] => {
  const centerpoints = geojson.features.map((feature) =>
    toPointWithSector(feature, converter)
  );
  return centerpoints;
};
