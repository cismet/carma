import { SnappingPoint } from "../types";

/**
 * Extract snapping points from a GeoJSON geometry
 * Handles all geometry types: Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon
 */
export function extractPointsFromGeometry(
  geometry: any,
  sourceId: string
): SnappingPoint[] {
  const points: SnappingPoint[] = [];

  if (!geometry || !geometry.type) {
    return points;
  }

  switch (geometry.type) {
    case "Point":
      points.push({
        coordinates: geometry.coordinates,
        sourceId,
        metadata: { geometryType: "Point" },
      });
      break;

    case "LineString":
      geometry.coordinates.forEach((coord: any) => {
        points.push({
          coordinates: coord,
          sourceId,
          metadata: { geometryType: "LineString" },
        });
      });
      break;

    case "Polygon":
      geometry.coordinates.forEach((ring: any) => {
        ring.forEach((coord: any) => {
          points.push({
            coordinates: coord,
            sourceId,
            metadata: { geometryType: "Polygon" },
          });
        });
      });
      break;

    case "MultiPoint":
      geometry.coordinates.forEach((coord: any) => {
        points.push({
          coordinates: coord,
          sourceId,
          metadata: { geometryType: "MultiPoint" },
        });
      });
      break;

    case "MultiLineString":
      geometry.coordinates.forEach((line: any) => {
        line.forEach((coord: any) => {
          points.push({
            coordinates: coord,
            sourceId,
            metadata: { geometryType: "MultiLineString" },
          });
        });
      });
      break;

    case "MultiPolygon":
      geometry.coordinates.forEach((polygon: any) => {
        polygon.forEach((ring: any) => {
          ring.forEach((coord: any) => {
            points.push({
              coordinates: coord,
              sourceId,
              metadata: { geometryType: "MultiPolygon" },
            });
          });
        });
      });
      break;

    default:
      console.warn(`Unknown geometry type: ${geometry.type}`);
  }

  return points;
}

/**
 * Extract snapping points from a measurement shape
 * Handles coordinate transformation from [lat, lng] to [lng, lat]
 */
export function extractPointsFromMeasurementShape(
  shape: any,
  sourceId: string
): SnappingPoint[] {
  const points: SnappingPoint[] = [];

  if (!shape || !shape.coordinates) {
    return points;
  }

  const type = (shape.shapeType || shape.shapeTy || "").toLowerCase();
  const coords = shape.coordinates;

  if (type === "polygon") {
    // Handle both single polygon and multi-polygon formats
    const rings = Array.isArray(coords[0][0]) ? coords : [coords];

    rings.forEach((ring: any[]) => {
      ring.forEach((pt: any[]) => {
        // Swap [lat, lng] to [lng, lat] for MapLibre compatibility
        points.push({
          coordinates: [pt[1], pt[0]],
          sourceId,
          metadata: {
            shapeId: shape.shapeId,
            geometryType: "polygon",
          },
        });
      });
    });
  } else {
    // Polyline/line: coords is array of points
    coords.forEach((pt: any[]) => {
      // Swap [lat, lng] to [lng, lat]
      points.push({
        coordinates: [pt[1], pt[0]],
        sourceId,
        metadata: {
          shapeId: shape.shapeId,
          geometryType: "polyline",
        },
      });
    });
  }

  return points;
}
