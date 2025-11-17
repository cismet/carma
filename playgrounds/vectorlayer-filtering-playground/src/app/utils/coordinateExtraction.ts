/**
 * Utility functions for extracting and processing coordinates from GeoJSON features
 */

/**
 * Extracts all coordinates from a collection of GeoJSON features as individual points
 */
export function extractCoordinatesFromFeatures(
  features: any[],
  properties: Record<string, any> = {}
): any[] {
  const coordinatePoints: any[] = [];

  features.forEach((feature: any) => {
    const geometry = feature.geometry;

    // Extract coordinates based on geometry type
    if (geometry.type === "Point") {
      coordinatePoints.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: geometry.coordinates,
        },
        properties: { ...properties },
      });
    } else if (geometry.type === "LineString") {
      geometry.coordinates.forEach((coord: any) => {
        coordinatePoints.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: coord,
          },
          properties: { ...properties },
        });
      });
    } else if (geometry.type === "Polygon") {
      geometry.coordinates.forEach((ring: any) => {
        ring.forEach((coord: any) => {
          coordinatePoints.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: coord,
            },
            properties: { ...properties },
          });
        });
      });
    } else if (geometry.type === "MultiPoint") {
      geometry.coordinates.forEach((coord: any) => {
        coordinatePoints.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: coord,
          },
          properties: { ...properties },
        });
      });
    } else if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((line: any) => {
        line.forEach((coord: any) => {
          coordinatePoints.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: coord,
            },
            properties: { ...properties },
          });
        });
      });
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon: any) => {
        polygon.forEach((ring: any) => {
          ring.forEach((coord: any) => {
            coordinatePoints.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: coord,
              },
              properties: { ...properties },
            });
          });
        });
      });
    }
  });

  return coordinatePoints;
}

/**
 * Filters points to only those within a specified pixel radius from a center point
 */
export function filterPointsByRadius(
  points: any[],
  centerPoint: { x: number; y: number },
  radius: number,
  maplibreMap: any
): any[] {
  return points.filter((pointFeature: any) => {
    const coord = pointFeature.geometry.coordinates;
    const projectedPoint = maplibreMap.project(coord);

    const dx = projectedPoint.x - centerPoint.x;
    const dy = projectedPoint.y - centerPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= radius;
  });
}

/**
 * Calculates distances for points and returns them with distance information
 */
export function calculatePointDistances(
  points: any[],
  centerPoint: { x: number; y: number },
  maplibreMap: any
): Array<{ pointFeature: any; distance: number }> {
  return points.map((pointFeature: any) => {
    const coord = pointFeature.geometry.coordinates;
    const projectedPoint = maplibreMap.project(coord);

    const dx = projectedPoint.x - centerPoint.x;
    const dy = projectedPoint.y - centerPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return { pointFeature, distance };
  });
}

/**
 * Finds the closest point from a list of points with distances
 */
export function findClosestPoint(
  pointsWithDistance: Array<{ pointFeature: any; distance: number }>
): { index: number; distance: number } | null {
  let shortestDistance = Infinity;
  let shortestIndex = -1;

  pointsWithDistance.forEach((item: any, index: number) => {
    if (item.distance < shortestDistance) {
      shortestDistance = item.distance;
      shortestIndex = index;
    }
  });

  if (shortestIndex === -1) {
    return null;
  }

  return { index: shortestIndex, distance: shortestDistance };
}

/**
 * Creates spider lines from a center point to multiple target points
 */
export function createSpiderLines(
  centerCoords: [number, number],
  targetPoints: any[],
  properties: Record<string, any> = {}
): any[] {
  return targetPoints.map((pointFeature: any) => {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [centerCoords, pointFeature.geometry.coordinates],
      },
      properties: { ...properties },
    };
  });
}
