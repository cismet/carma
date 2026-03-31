import type { CssPixelPosition, CssPixels } from "@carma/units/types";

import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  SceneTransforms,
  defined,
  type Cartesian2,
  type Scene,
} from "../../cesium";
import type { Cartesian3Json } from "../../serialization";
export type CesiumGeographicCoordinate = {
  latitude: number;
  longitude: number;
  altitude: number;
};

const toCssPixelPosition = (position: { x: number; y: number }) =>
  ({
    x: position.x as CssPixels,
    y: position.y as CssPixels,
  } satisfies CssPixelPosition);

export type Cartesian3JsonToScreenProjector = (
  coordinate: Cartesian3Json
) => CssPixelPosition | null;

export type GeographicToScreenProjector = (
  coordinate: CesiumGeographicCoordinate
) => CssPixelPosition | null;

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
  return createCartesian3JsonToScreenProjector(scene)(coordinate);
};

export const projectGeographicCoordinateToScreen = (
  scene: Scene | null,
  coordinate: CesiumGeographicCoordinate
): CssPixelPosition | null => {
  return createGeographicCoordinateToScreenProjector(scene)(coordinate);
};

export const createCartesian3JsonToScreenProjector = (scene: Scene | null) => {
  const worldPointScratch = new Cartesian3();
  return ((coordinate: Cartesian3Json): CssPixelPosition | null => {
    if (!scene || scene.isDestroyed()) {
      return null;
    }

    const worldPoint = Cartesian3.fromElements(
      coordinate.x,
      coordinate.y,
      coordinate.z,
      worldPointScratch
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
  }) satisfies Cartesian3JsonToScreenProjector;
};

export const createGeographicCoordinateToScreenProjector = (
  scene: Scene | null
) => {
  const worldPointScratch = new Cartesian3();
  return ((coordinate: CesiumGeographicCoordinate): CssPixelPosition | null => {
    if (!scene || scene.isDestroyed()) {
      return null;
    }

    const worldPoint = Cartesian3.fromDegrees(
      coordinate.longitude,
      coordinate.latitude,
      coordinate.altitude,
      undefined,
      worldPointScratch
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
  }) satisfies GeographicToScreenProjector;
};

export const projectGeographicCoordinatesToScreen = (
  scene: Scene | null,
  coordinates: readonly CesiumGeographicCoordinate[],
  output: Array<CssPixelPosition | null> = []
): Array<CssPixelPosition | null> => {
  const project = createGeographicCoordinateToScreenProjector(scene);
  output.length = coordinates.length;
  for (let index = 0; index < coordinates.length; index += 1) {
    output[index] = project(coordinates[index]);
  }
  return output;
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
