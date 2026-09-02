import { clamp } from "@carma-commons/math";
import * as THREE from "three";

const MAX_RECEIVERS_PER_LEAF = 8;
const DEPTH_EPSILON = 1e-6;
const boxAxes = ["x", "y", "z"] as const;

export interface ShadowReceiverSource {
  readonly bounds: THREE.Box3;
  readonly maximumCasterDistance: number;
  readonly geometricError: number;
  readonly centerness: number;
}

export interface ShadowReceiverMatch {
  receiverGeometricError: number;
  receiverCenterness: number;
  lightFacing: number;
}

export interface ShadowReceiverMask {
  readonly sourceCount: number;
  match: (candidate: THREE.Box3, target: ShadowReceiverMatch) => boolean;
}

export interface ShadowReceiverTileTarget {
  inView: boolean;
  error: number;
}

export const maximumSweepDistanceWithinBox = (
  source: THREE.Box3,
  container: THREE.Box3,
  direction: THREE.Vector3
): number => {
  let maximumDistance = Number.POSITIVE_INFINITY;
  for (const axis of boxAxes) {
    const component = direction[axis];
    if (Math.abs(component) <= Number.EPSILON) continue;
    const distance =
      component > 0
        ? (container.max[axis] - source.min[axis]) / component
        : (container.min[axis] - source.max[axis]) / component;
    maximumDistance = Math.min(maximumDistance, distance);
  }
  return Number.isFinite(maximumDistance) ? Math.max(0, maximumDistance) : 0;
};

type IndexedReceiver = Readonly<{
  bounds: THREE.Box3;
  geometricError: number;
  centerness: number;
}>;

type ReceiverNode = Readonly<{
  bounds: THREE.Box3;
  minimumGeometricError: number;
  receiverCenterness: number;
  receivers?: readonly IndexedReceiver[];
  left?: ReceiverNode;
  right?: ReceiverNode;
}>;

const isFiniteBox = (box: THREE.Box3) =>
  !box.isEmpty() &&
  Number.isFinite(box.min.x) &&
  Number.isFinite(box.min.y) &&
  Number.isFinite(box.min.z) &&
  Number.isFinite(box.max.x) &&
  Number.isFinite(box.max.y) &&
  Number.isFinite(box.max.z);

const includeMatch = (
  target: ShadowReceiverMatch,
  receiverGeometricError: number,
  receiverCenterness: number
) => {
  target.receiverGeometricError = Math.min(
    target.receiverGeometricError,
    receiverGeometricError
  );
  target.receiverCenterness = Math.max(
    target.receiverCenterness,
    receiverCenterness
  );
};

const unionBounds = (receivers: readonly IndexedReceiver[]) => {
  const bounds = new THREE.Box3().makeEmpty();
  for (const receiver of receivers) bounds.union(receiver.bounds);
  return bounds;
};

const buildReceiverNode = (
  receivers: readonly IndexedReceiver[]
): ReceiverNode => {
  const bounds = unionBounds(receivers);
  let minimumGeometricError = Number.POSITIVE_INFINITY;
  let receiverCenterness = 0;
  for (const receiver of receivers) {
    minimumGeometricError = Math.min(
      minimumGeometricError,
      receiver.geometricError
    );
    receiverCenterness = Math.max(receiverCenterness, receiver.centerness);
  }
  if (receivers.length <= MAX_RECEIVERS_PER_LEAF) {
    return {
      bounds,
      minimumGeometricError,
      receiverCenterness,
      receivers,
    };
  }

  const size = bounds.getSize(new THREE.Vector3());
  const axis =
    size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  const sorted = [...receivers].sort(
    (first, second) =>
      (first.bounds.min[axis] + first.bounds.max[axis]) / 2 -
      (second.bounds.min[axis] + second.bounds.max[axis]) / 2
  );
  const midpoint = Math.floor(sorted.length / 2);
  return {
    bounds,
    minimumGeometricError,
    receiverCenterness,
    left: buildReceiverNode(sorted.slice(0, midpoint)),
    right: buildReceiverNode(sorted.slice(midpoint)),
  };
};

const queryReceiverNode = (
  node: ReceiverNode,
  candidate: THREE.Box3,
  target: ShadowReceiverMatch
) => {
  if (!node.bounds.intersectsBox(candidate)) return;
  if (candidate.containsBox(node.bounds)) {
    includeMatch(target, node.minimumGeometricError, node.receiverCenterness);
    return;
  }
  if (node.receivers) {
    for (const receiver of node.receivers) {
      if (receiver.bounds.intersectsBox(candidate)) {
        includeMatch(target, receiver.geometricError, receiver.centerness);
      }
    }
    return;
  }
  if (node.left) queryReceiverNode(node.left, candidate, target);
  if (node.right) queryReceiverNode(node.right, candidate, target);
};

/**
 * Builds a light-space BVH of the camera-visible receiver frontier swept
 * toward the sun. Tile hierarchy branches that miss every swept receiver
 * volume can be discarded before their payload is requested.
 */
export const createShadowReceiverMask = (
  sources: readonly ShadowReceiverSource[],
  tilesToShadowView: THREE.Matrix4
): ShadowReceiverMask | null => {
  const receivers: IndexedReceiver[] = [];
  for (const source of sources) {
    const bounds = source.bounds.clone().applyMatrix4(tilesToShadowView);
    if (!isFiniteBox(bounds)) continue;
    bounds.max.z += Math.max(0, source.maximumCasterDistance);
    bounds.expandByScalar(DEPTH_EPSILON);
    receivers.push({
      bounds,
      geometricError:
        Number.isFinite(source.geometricError) && source.geometricError >= 0
          ? source.geometricError
          : Number.MAX_VALUE,
      centerness: clamp(source.centerness, 0, 1),
    });
  }
  if (receivers.length === 0) return null;

  const root = buildReceiverNode(receivers);
  const lightDepthRange = Math.max(
    DEPTH_EPSILON,
    root.bounds.max.z - root.bounds.min.z
  );
  const projectedCandidate = new THREE.Box3();
  return {
    sourceCount: receivers.length,
    match(candidate, target) {
      projectedCandidate.copy(candidate).applyMatrix4(tilesToShadowView);
      if (!isFiniteBox(projectedCandidate)) return false;
      target.receiverGeometricError = Number.POSITIVE_INFINITY;
      target.receiverCenterness = 0;
      target.lightFacing = clamp(
        (projectedCandidate.max.z - root.bounds.min.z) / lightDepthRange,
        0,
        1
      );
      queryReceiverNode(root, projectedCandidate, target);
      return target.receiverGeometricError !== Number.POSITIVE_INFINITY;
    },
  };
};

export const receiverMatchedTileError = (
  tileGeometricError: number,
  receiverGeometricError: number,
  errorTarget: number
): number => {
  if (receiverGeometricError <= DEPTH_EPSILON) {
    return tileGeometricError <= DEPTH_EPSILON ? 0 : Number.POSITIVE_INFINITY;
  }
  return (
    errorTarget * (Math.max(0, tileGeometricError) / receiverGeometricError)
  );
};

export const applyShadowReceiverMask = (
  mask: ShadowReceiverMask,
  candidate: THREE.Box3,
  target: ShadowReceiverTileTarget,
  match: ShadowReceiverMatch,
  tileGeometricError: number,
  errorTarget: number
): boolean => {
  const matched = mask.match(candidate, match);
  target.inView = matched;
  if (matched) {
    target.error = receiverMatchedTileError(
      tileGeometricError,
      match.receiverGeometricError,
      errorTarget
    );
  }
  return matched;
};
