import { Cartesian3, Cartographic, Scene } from "cesium";

import type { Radians } from "@carma/units/types";
import type { TypedConverter } from "@carma/geo/proj";
import { radToDeg } from "@carma/units/helpers";
import { getOrbitPoint } from "@carma-mapping/engines/cesium";

import { getHeadingFromCardinalDirection } from "./orientationUtils";
import type { CardinalDirectionEnum } from "./orientationUtils";

export interface Point {
  x: number;
  y: number;
}

export function calculatePointOnGround(
  cameraHeading: number,
  cameraHeight: number,
  cameraPitch: number
): Point {
  const distanceOnGround = cameraPitch
    ? cameraHeight * Math.tan(cameraPitch)
    : 0;

  return {
    x: -distanceOnGround * Math.sin(cameraHeading),
    y: distanceOnGround * Math.cos(cameraHeading),
  };
}

export function calculatePointOnRadius(
  pointOnGround: Point,
  distanceOnGround: number,
  sectorHeading: number
): Point {
  return {
    x: pointOnGround.x + distanceOnGround * Math.sin(sectorHeading),
    y: pointOnGround.y - distanceOnGround * Math.cos(sectorHeading),
  };
}

export function calculateReferencePointFromOrbit(
  orbitPointCoords: [number, number, number],
  cameraCoords: [number, number, number],
  pointOnRadius: Point
): [number, number] {
  // Use camera coords as base reference, applying the calculated radius point offset
  // This maintains compatibility with the original implementation
  return [
    cameraCoords[0] + pointOnRadius.x,
    cameraCoords[1] - pointOnRadius.y, // Y is inverted in SVG coordinates
  ];
}

export function calculateSectorHeading(
  cardinalSector: CardinalDirectionEnum,
  headingOffset: number
): number {
  return getHeadingFromCardinalDirection(cardinalSector) + headingOffset;
}

export function calculateImageCoordsFromCamera(
  longitude: number,
  latitude: number,
  height: number,
  converter: TypedConverter
): [number, number, number] {
  return converter.inverse([
    radToDeg(longitude as Radians),
    radToDeg(latitude as Radians),
    height,
  ]) as [number, number, number];
}

export function calculateImageCoordsFromCartesian(
  cartesian: Cartesian3 | undefined,
  converterObj: TypedConverter
): [number, number, number] | null {
  if (!cartesian) {
    return null;
  }

  const cartographic = Cartographic.fromCartesian(cartesian);
  return calculateImageCoordsFromCamera(
    cartographic.longitude,
    cartographic.latitude,
    cartographic.height,
    converterObj
  );
}

export function calculateOrbitPointCoords(
  scene: Scene,
  converterObj: TypedConverter
): [number, number, number] | null {
  // Use the existing getOrbitPoint method from Cesium engine
  const orbitPoint = getOrbitPoint(scene);
  if (!orbitPoint) {
    return null;
  }

  return calculateImageCoordsFromCartesian(orbitPoint, converterObj);
}
