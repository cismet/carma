import * as TilesRendererCore from "3d-tiles-renderer/core";
import { type Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import { GLTFPrimitiveOutlineExtension } from "@carma-mapping/engines/threejs";

import type { TilesDeviceProfile } from "./three-tiles-load-policy";
import type { RuntimeTile } from "./three-tiles-runtime-types";

// tile.internal.loadingState values (3d-tiles-renderer core constants.js; the
// core typings do not export them).
export const UNLOADED_LOADING_STATE = 0;

export const FAILED_LOADING_STATE = -1;

export const TILE_OUTLINE_FLAG = "isTileOutline";

export const tilesRendererCoreRuntime = TilesRendererCore as unknown as {
  DEFAULT_LRU_CACHE: {
    unloadPriorityCallback: (first: unknown, second: unknown) => number;
  };
  unifiedPriorityCallback: (first: unknown, second: unknown) => number;
};

export const tilesCacheUnloadPriorityCallback =
  tilesRendererCoreRuntime.DEFAULT_LRU_CACHE.unloadPriorityCallback;

export const tilesQueuePriorityCallback =
  tilesRendererCoreRuntime.unifiedPriorityCallback;

// Mirrors upstream DEFAULT_NODE_QUEUE.priorityCallback (not exported from the
// bundled build): children are processed in the load order of their parents.
export const tilesNodeQueuePriorityCallback = (
  first: Tile,
  second: Tile
): number => {
  const firstParent = first.parent;
  const secondParent = second.parent;
  if (firstParent === secondParent) return 0;
  if (!firstParent) return 1;
  if (!secondParent) return -1;
  return tilesQueuePriorityCallback(firstParent, secondParent);
};

export const frustumCornerPlanes = [
  [0, 3, 4],
  [1, 3, 4],
  [0, 2, 4],
  [1, 2, 4],
  [0, 3, 5],
  [1, 3, 5],
  [0, 2, 5],
  [1, 2, 5],
] as const;

export const frustumCornerMatrix = new THREE.Matrix3();

/**
 * Frustum with its eight corner points, which upstream's oriented bounding
 * box test needs (mirrors the unexported `ExtendedFrustum` of the renderer).
 */
export class TilesViewFrustum extends THREE.Frustum {
  readonly points = Array.from({ length: 8 }, () => new THREE.Vector3());

  override setFromProjectionMatrix(
    matrix: THREE.Matrix4,
    coordinateSystem?: THREE.CoordinateSystem,
    reversedDepth?: boolean
  ): this {
    super.setFromProjectionMatrix(matrix, coordinateSystem, reversedDepth);
    const { planes, points } = this;
    frustumCornerPlanes.forEach(([first, second, third], index) => {
      const a = planes[first];
      const b = planes[second];
      const c = planes[third];
      frustumCornerMatrix.set(
        a.normal.x,
        a.normal.y,
        a.normal.z,
        b.normal.x,
        b.normal.y,
        b.normal.z,
        c.normal.x,
        c.normal.y,
        c.normal.z
      );
      points[index]
        .set(-a.constant, -b.constant, -c.constant)
        .applyMatrix3(frustumCornerMatrix.invert());
    });
    return this;
  }
}

export const readTilesDeviceProfile = (): TilesDeviceProfile => {
  if (typeof navigator === "undefined") {
    return { userAgent: "", platform: "", maxTouchPoints: 0 };
  }
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  return {
    deviceMemoryGiB:
      typeof deviceMemory === "number" ? deviceMemory : undefined,
    userAgent: navigator.userAgent ?? "",
    platform: navigator.platform ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
};

export const resolveTileContentUrl = (tile: Tile): string | null => {
  const uri = tile.content?.uri;
  if (!uri) return null;
  try {
    return new URL(uri, `${tile.internal.basePath}/`).toString();
  } catch {
    return uri;
  }
};

/**
 * Upstream computes `unconditionallyRefine` after the view error of a tile, so
 * derive the current-frame value for the deferral decision the same way.
 */
export const isUnconditionallyRefined = (tile: Tile): boolean => {
  if (tile.internal.hasUnrenderableContent) return true;
  let ancestor = tile.parent as RuntimeTile | null;
  while (ancestor && ancestor.traversal?.unconditionallyRefine) {
    ancestor = ancestor.parent as RuntimeTile | null;
  }
  return ancestor !== null && ancestor.geometricError <= tile.geometricError;
};

export const readMapView = (
  map: MaplibreMap | null
): { zoom: number; pitch: number } =>
  map && typeof map.getZoom === "function" && typeof map.getPitch === "function"
    ? { zoom: map.getZoom(), pitch: map.getPitch() }
    : { zoom: 0, pitch: 0 };

export const buildPrimitiveOutlinePlugin = (
  parser: unknown,
  options: {
    color: THREE.ColorRepresentation;
    opacity: number;
  }
) => ({
  name: "CARMA_lazy_primitive_outline",
  async afterRoot(result: { scene: THREE.Object3D }) {
    await new GLTFPrimitiveOutlineExtension(
      parser as ConstructorParameters<typeof GLTFPrimitiveOutlineExtension>[0],
      options
    ).afterRoot(result);
  },
});
