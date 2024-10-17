import { Cartographic, Math as CesiumMath } from "cesium";

import type { LatLngRadians, LatLngRecord } from "types/common-geo";

export const EARTH_RADIUS = 6371008.7714;

export const generateRingFromDegrees = (
  centerDeg: LatLngRecord,
  radiusInMeters: number,
  samples: number = 24,
): LatLngRadians[] => {
  const center = Cartographic.fromDegrees(
    centerDeg.longitude,
    centerDeg.latitude,
  );
  const points: LatLngRadians[] = [];

  const scaleFactor = {
    latitude: 1 / EARTH_RADIUS,
    longitude: 1 / (EARTH_RADIUS * Math.cos(center.latitude)),
  };

  for (let i = 0; i < samples; i++) {
    const angle = (CesiumMath.TWO_PI * i) / samples;
    const dx = radiusInMeters * Math.cos(angle);
    const dy = radiusInMeters * Math.sin(angle);
    const point = {
      lngRad: center.longitude + dx * scaleFactor.longitude,
      latRad: center.latitude + dy * scaleFactor.latitude,
    };

    points.push(point);
  }
  points[0] && points.push(points[0]); // Close the loop
  return points;
};
