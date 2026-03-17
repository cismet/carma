import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  SceneTransforms,
  defined,
  type Cartesian2,
  type Scene,
} from "../../cesium";
import type { CssPixelPosition, CssPixels } from "@carma/units/types";
import type { Cartesian3Json } from "../../serialization/base";

export type CesiumGeographicCoordinate = {
  latitude: number;
  longitude: number;
  altitude: number;
};

const CARTESIAN_JSON_SCRATCH = new Cartesian3();
const GEOGRAPHIC_COORDINATE_SCRATCH = new Cartesian3();

const toCssPixelPosition = (position: { x: number; y: number }) =>
  ({
    x: position.x as CssPixels,
    y: position.y as CssPixels,
  } satisfies CssPixelPosition);

export const cartesian3FromGeographicCoordinate = (
  coordinate: CesiumGeographicCoordinate
) =>
  Cartesian3.fromDegrees(
    coordinate.longitude,
    coordinate.latitude,
    coordinate.altitude
  );

export const geographicCoordinateFromCartesian3 = (
  coordinate: Cartesian3
): CesiumGeographicCoordinate => {
  const cartographic = Cartographic.fromCartesian(coordinate);

  return {
    latitude: CesiumMath.toDegrees(cartographic.latitude),
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    altitude: cartographic.height,
  };
};

export const projectCartesian3JsonToScreen = (
  scene: Scene | null,
  coordinate: Cartesian3Json
): CssPixelPosition | null => {
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const worldPoint = Cartesian3.fromElements(
    coordinate.x,
    coordinate.y,
    coordinate.z,
    CARTESIAN_JSON_SCRATCH
  );
  const screenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    worldPoint
  );

  if (
    !defined(screenPosition) ||
    !Number.isFinite(screenPosition.x) ||
    !Number.isFinite(screenPosition.y)
  ) {
    return null;
  }

  return toCssPixelPosition(screenPosition);
};

export const projectGeographicCoordinateToScreen = (
  scene: Scene | null,
  coordinate: CesiumGeographicCoordinate
): CssPixelPosition | null => {
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const worldPoint = Cartesian3.fromDegrees(
    coordinate.longitude,
    coordinate.latitude,
    coordinate.altitude,
    undefined,
    GEOGRAPHIC_COORDINATE_SCRATCH
  );
  const screenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    worldPoint
  );

  if (
    !defined(screenPosition) ||
    !Number.isFinite(screenPosition.x) ||
    !Number.isFinite(screenPosition.y)
  ) {
    return null;
  }

  return toCssPixelPosition(screenPosition);
};

export const resolveGeographicCoordinateFromScreenPosition = (
  scene: Scene,
  screenPosition: Cartesian2
): CesiumGeographicCoordinate | null => {
  let pickedPosition: Cartesian3 | null = scene.pickPosition(screenPosition);

  if (!defined(pickedPosition)) {
    const ray = scene.camera.getPickRay(screenPosition);
    pickedPosition =
      ray && defined(scene.globe) ? scene.globe.pick(ray, scene) ?? null : null;
  }

  if (!defined(pickedPosition)) {
    return null;
  }

  const cartographic = Cartographic.fromCartesian(pickedPosition);
  return {
    latitude: CesiumMath.toDegrees(cartographic.latitude),
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    altitude: cartographic.height,
  };
};
