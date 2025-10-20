import { Cartographic, CesiumMath } from "@carma/cesium";
import { EARTH_RADIUS } from "@carma/geo/utils";
import type { LatLng, Latitude, Longitude } from "@carma/geo/types";

export const generatePositionsForRing = (
  n = 8,
  radius = 0.1,
  center = [0.5, 0.5]
) => {
  const positions: [number, number][] = [];
  const [cx, cy] = center;
  if (!cx || !cy) {
    return positions;
  }
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    positions.push([x, y]);
  }
  return positions;
};

export const generateRingFromDegrees = (
  centerDeg: LatLng.deg,
  radiusInMeters: number,
  samples: number = 24
): LatLng.rad[] => {
  const center = Cartographic.fromDegrees(
    centerDeg.longitude,
    centerDeg.latitude
  );
  const points: LatLng.rad[] = [];

  const scaleFactor = {
    latitude: 1 / EARTH_RADIUS,
    longitude: 1 / (EARTH_RADIUS * Math.cos(center.latitude)),
  };

  for (let i = 0; i < samples; i++) {
    const angle = (CesiumMath.TWO_PI * i) / samples;
    const dx = radiusInMeters * Math.cos(angle);
    const dy = radiusInMeters * Math.sin(angle);
    points.push({
      longitude: (center.longitude +
        dx * scaleFactor.longitude) as Longitude.rad,
      latitude: (center.latitude + dy * scaleFactor.latitude) as Latitude.rad,
    });
  }
  if (!points.length || points[0] === undefined) {
    console.debug("No points generated");
    return points;
  }
  points.push(points[0]); // Close the loop
  return points;
};
