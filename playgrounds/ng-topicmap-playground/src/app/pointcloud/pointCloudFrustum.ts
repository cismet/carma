import * as THREE from "three";

import type { CopcNodeDescriptor } from "./copcLoader";

const MEBIBYTE = 1024 ** 2;
export const MAX_DECODED_POINT_CACHE_BYTES = 256 * MEBIBYTE;
export const POINT_CLOUD_FRUSTUM_OVERSCAN = 1.06;

/** Scene-wide decoded cache share, divided over active point-cloud sources. */
export const deriveDecodedPointCacheBudget = (
  pointMemoryBudgetBytes: number,
  activeCloudCount: number
): number =>
  Math.max(
    16 * MEBIBYTE,
    Math.floor(
      Math.min(
        MAX_DECODED_POINT_CACHE_BYTES,
        Math.max(0, pointMemoryBudgetBytes) * 0.25
      ) / Math.max(1, activeCloudCount)
    )
  );

export interface FrustumNodeSelection {
  keys: string[];
  pointCount: number;
  visibleNodeCount: number;
}

interface RankedNode {
  node: CopcNodeDescriptor;
  tier: number;
  centerDistance: number;
}

export interface FrustumLodOptions {
  viewportWidth: number;
  viewportHeight: number;
  /** Skip detail whose native point spacing projects below this size. */
  minimumSpacingPixels?: number;
}

const corners = Array.from({ length: 8 }, () => new THREE.Vector4());

const rankBounds = (
  node: CopcNodeDescriptor,
  clipFromLocal: THREE.Matrix4,
  overscan: number,
  lod?: FrustumLodOptions
): { tier: number; centerDistance: number } | null => {
  const bounds = node.boundsLocal;
  let index = 0;
  for (const x of [bounds[0], bounds[3]]) {
    for (const y of [bounds[1], bounds[4]]) {
      for (const z of [bounds[2], bounds[5]]) {
        corners[index++].set(x, y, z, 1).applyMatrix4(clipFromLocal);
      }
    }
  }

  const intersects = (margin: number): boolean => {
    // Test the AABB against the homogeneous clip planes. Checking only corners
    // with w > 0 makes any box straddling the eye plane look visible on every
    // side, which kept large COPC nodes resident while looking away from them.
    const outsideLeft = corners.every(
      (corner) => corner.x < -corner.w * margin
    );
    const outsideRight = corners.every(
      (corner) => corner.x > corner.w * margin
    );
    const outsideBottom = corners.every(
      (corner) => corner.y < -corner.w * margin
    );
    const outsideTop = corners.every((corner) => corner.y > corner.w * margin);
    const outsideNear = corners.every((corner) => corner.z < -corner.w);
    const outsideFar = corners.every((corner) => corner.z > corner.w);
    return !(
      outsideLeft ||
      outsideRight ||
      outsideBottom ||
      outsideTop ||
      outsideNear ||
      outsideFar
    );
  };

  const tier = intersects(1) ? 0 : intersects(overscan) ? 1 : -1;
  if (tier < 0) return null;
  const center = new THREE.Vector4(
    (bounds[0] + bounds[3]) / 2,
    (bounds[1] + bounds[4]) / 2,
    (bounds[2] + bounds[5]) / 2,
    1
  ).applyMatrix4(clipFromLocal);
  const centerDistance =
    center.w > 0
      ? Math.hypot(center.x / center.w, center.y / center.w)
      : Number.POSITIVE_INFINITY;

  if (lod && node.depth > 1 && center.w > 0) {
    const projectToPixels = (point: THREE.Vector4): [number, number] => [
      (point.x / point.w) * lod.viewportWidth * 0.5,
      (point.y / point.w) * lod.viewportHeight * 0.5,
    ];
    const centerPixels = projectToPixels(center);
    let pixelsPerMeter = 0;
    for (const axis of [
      new THREE.Vector4(1, 0, 0, 0),
      new THREE.Vector4(0, 1, 0, 0),
      new THREE.Vector4(0, 0, 1, 0),
    ]) {
      const offset = center.clone().add(axis.applyMatrix4(clipFromLocal));
      if (offset.w <= 0) continue;
      const offsetPixels = projectToPixels(offset);
      pixelsPerMeter = Math.max(
        pixelsPerMeter,
        Math.hypot(
          offsetPixels[0] - centerPixels[0],
          offsetPixels[1] - centerPixels[1]
        )
      );
    }
    if (node.spacing * pixelsPerMeter < (lod.minimumSpacingPixels ?? 0.75)) {
      return null;
    }
  }
  return { tier, centerDistance };
};

/**
 * Selects a progressive COPC working set for the current view. Nodes in the
 * actual viewport precede the small overscan ring, coarse octree levels load
 * before detail, and equally detailed nodes load from screen center outward.
 */
export const selectCopcNodesForFrustum = (
  nodes: readonly CopcNodeDescriptor[],
  clipFromLocal: THREE.Matrix4,
  pointBudget: number,
  overscan = POINT_CLOUD_FRUSTUM_OVERSCAN,
  lod?: FrustumLodOptions
): FrustumNodeSelection => {
  const ranked: RankedNode[] = [];
  let visibleNodeCount = 0;
  for (const node of nodes) {
    const rank = rankBounds(node, clipFromLocal, overscan, lod);
    if (!rank) continue;
    if (rank.tier === 0) visibleNodeCount++;
    ranked.push({ node, ...rank });
  }
  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.node.depth - b.node.depth ||
      a.centerDistance - b.centerDistance ||
      a.node.key.localeCompare(b.node.key)
  );

  const normalizedBudget = Math.max(0, Math.floor(pointBudget));
  const keys: string[] = [];
  let pointCount = 0;
  for (const { node } of ranked) {
    if (keys.length > 0 && pointCount + node.pointCount > normalizedBudget) {
      continue;
    }
    if (normalizedBudget === 0) break;
    keys.push(node.key);
    pointCount += node.pointCount;
  }
  return { keys, pointCount, visibleNodeCount };
};
