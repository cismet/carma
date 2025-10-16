import { Cartographic, Math as CesiumMath } from "cesium";
import type { LatLng } from "@carma/geo/types";
import { EARTH_RADIUS } from "@carma/geo/utils";

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
    const point = {
      longitude: center.longitude + dx * scaleFactor.longitude,
      latitude: center.latitude + dy * scaleFactor.latitude,
    } as LatLng.rad;

    points.push(point);
  }
  points[0] && points.push(points[0]); // Close the loop
  return points;
};
