import * as THREE from "three";

import { degToRadNumeric } from "@carma-units";

import type { SolarPosition } from "./solar-position";

export const solarPositionToSceneDirection = ({
  azimuthDegrees,
  elevationDegrees,
}: SolarPosition): THREE.Vector3 => {
  const azimuth = degToRadNumeric(azimuthDegrees);
  const elevation = degToRadNumeric(elevationDegrees);
  const horizontal = Math.cos(elevation);
  // Shared scene axes: +X east, +Y up, -Z north.
  return new THREE.Vector3(
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    -Math.cos(azimuth) * horizontal
  ).normalize();
};
