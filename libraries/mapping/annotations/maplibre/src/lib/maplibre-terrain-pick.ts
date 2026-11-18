import { Vector3 } from "three";
import {
  geographicCoordinateFromEcef,
  readEnuAxesAtEcef,
} from "@carma-geo/proj";
import type { Meters } from "@carma-units";
import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  marchTerrainRay,
  resolveTerrainNormalEnu,
} from "./maplibre-terrain-ray-march";

/**
 * Picks on a Three.js terrain against the heights of the tiles it draws
 * rather than raycasting them: a terrain tile holds hundreds of thousands of
 * triangles, and coarse tiles kept beneath the fine ones would catch a
 * raycast first. A picked point carries the height the terrain data carry,
 * like a point on a mesh.
 */

/** The heights of the terrain surfaces drawn, the highest where they overlap. */
export type MapLibreTerrainHeights = (
  longitude: number,
  latitude: number
) => number | undefined;

const TERRAIN_NORMAL_SAMPLE = Object.freeze({
  /** Spacing of the four height samples a normal is derived from, on screen. */
  offsetPx: 2,
  minMeters: 0.5 as Meters,
});

export const resolveMapLibreTerrainHeights = (
  runtimes: readonly SharedThreeSceneRuntime[]
): MapLibreTerrainHeights | null => {
  const terrains = runtimes.filter(
    (runtime) => typeof runtime.getDrawnElevation === "function"
  );
  if (terrains.length === 0) return null;
  return (longitude, latitude) => {
    let height: number | undefined;
    for (const terrain of terrains) {
      const candidate = terrain.getDrawnElevation?.(longitude, latitude);
      if (
        candidate !== undefined &&
        Number.isFinite(candidate) &&
        (height === undefined || candidate > height)
      ) {
        height = candidate;
      }
    }
    return height;
  };
};

/**
 * Distance along the scene ray to the terrain, or null. `eyeDistance` is the
 * ray origin's distance from the camera.
 */
export const intersectMapLibreTerrain = (
  scene: MapLibreAnnotationScene,
  heights: MapLibreTerrainHeights,
  origin: Vector3,
  direction: Vector3,
  far: number,
  eyeDistance: number
): number | null => {
  const sample = new Vector3();
  return marchTerrainRay(
    (distance) => {
      const located = scene.lngLatAltitudeFromScene(
        sample.copy(origin).addScaledVector(direction, distance)
      );
      const height = located && heights(located.lngLat[0], located.lngLat[1]);
      return located && height !== undefined
        ? located.altitude - height
        : undefined;
    },
    far,
    eyeDistance
  );
};

/** Upward unit normal in ECEF of the terrain at a picked point, from heights about two pixels around it. */
export const resolveMapLibreTerrainNormal = (
  scene: MapLibreAnnotationScene,
  heights: MapLibreTerrainHeights,
  scenePosition: Vector3,
  positionECEF: Vector3
): Vector3 | null => {
  const pixelsPerMeter = scene.getPixelsPerMeterAtScene(scenePosition);
  const spacing = Math.max(
    TERRAIN_NORMAL_SAMPLE.minMeters,
    pixelsPerMeter > 0 ? TERRAIN_NORMAL_SAMPLE.offsetPx / pixelsPerMeter : 0
  );
  const { east, north, up } = readEnuAxesAtEcef(positionECEF);
  const heightAt = (axis: Vector3, sign: number) => {
    const { longitude, latitude } = geographicCoordinateFromEcef(
      positionECEF.clone().addScaledVector(axis, sign * spacing)
    );
    return heights(longitude, latitude);
  };
  const normal = resolveTerrainNormalEnu(
    {
      east: heightAt(east, 1),
      west: heightAt(east, -1),
      north: heightAt(north, 1),
      south: heightAt(north, -1),
    },
    spacing
  );
  return normal
    ? east
        .multiplyScalar(normal[0])
        .addScaledVector(north, normal[1])
        .addScaledVector(up, normal[2])
        .normalize()
    : null;
};
