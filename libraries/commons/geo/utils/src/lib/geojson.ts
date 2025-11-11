import type { Geometry } from "geojson";

// todo validate this or use turf methods

export const getCoordinates = (geometry: Geometry) => {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates[0][0];
    case "MultiPolygon":
      return geometry.coordinates[0][0][0];
    case "LineString":
      return geometry.coordinates[1];
    case "Point":
      return geometry.coordinates;
    case "MultiPoint":
      return geometry.coordinates[0];
    case "MultiLineString":
      return geometry.coordinates[0][1];
    case "GeometryCollection":
      console.warn(
        "GeometryCollection detected - cannot extract coordinates directly"
      );
      return undefined;
    default: {
      const exhaustiveCheck: never = geometry;
      console.warn(`Unknown geometry type detected:`, exhaustiveCheck);
      return undefined;
    }
  }
};
