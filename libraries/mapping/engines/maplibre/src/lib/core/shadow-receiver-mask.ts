import { clamp } from "@carma-commons/math";
import * as THREE from "three";

const MAX_RECEIVERS_PER_LEAF = 8;
const DEPTH_EPSILON = 1e-6;
const boxAxes = ["x", "y", "z"] as const;

export interface ShadowReceiverSource {
  readonly bounds: THREE.Box3;
  /** Optional local-box to tile-space transform; compose before enclosing the
   * box in light space to avoid inflating an OBB through an intermediate AABB. */
  readonly boundsTransform?: THREE.Matrix4;
  readonly maximumCasterDistance: number;
  readonly geometricError: number;
  /** Optional allowed caster error for the shared progressive shadow stage. */
  readonly casterGeometricError?: number;
  readonly screenErrorPixels?: number;
  readonly centerness: number;
}

export interface ShadowReceiverMatch {
  receiverGeometricError: number;
  receiverCenterness: number;
  lightFacing: number;
  receiverPixelsPerMeter?: number;
}

export interface ShadowReceiverMask {
  readonly sourceCount: number;
  match: (
    candidate: THREE.Box3,
    target: ShadowReceiverMatch,
    candidateTransform?: THREE.Matrix4
  ) => boolean;
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
  sourceBounds: THREE.Box3;
  maximumCasterDistance: number;
  angularSlope: number;
  geometricError: number;
  centerness: number;
  pixelsPerMeter: number;
}>;

type ReceiverNode = Readonly<{
  bounds: THREE.Box3;
  minimumGeometricError: number;
  receiverCenterness: number;
  maximumPixelsPerMeter: number;
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
  receiverCenterness: number,
  pixelsPerMeter: number
) => {
  target.receiverGeometricError = Math.min(
    target.receiverGeometricError,
    receiverGeometricError
  );
  target.receiverCenterness = Math.max(
    target.receiverCenterness,
    receiverCenterness
  );
  target.receiverPixelsPerMeter = Math.max(
    target.receiverPixelsPerMeter ?? 0,
    pixelsPerMeter
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
  let maximumPixelsPerMeter = 0;
  for (const receiver of receivers) {
    minimumGeometricError = Math.min(
      minimumGeometricError,
      receiver.geometricError
    );
    receiverCenterness = Math.max(receiverCenterness, receiver.centerness);
    maximumPixelsPerMeter = Math.max(
      maximumPixelsPerMeter,
      receiver.pixelsPerMeter
    );
  }
  if (receivers.length <= MAX_RECEIVERS_PER_LEAF) {
    return {
      bounds,
      minimumGeometricError,
      receiverCenterness,
      maximumPixelsPerMeter,
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
    maximumPixelsPerMeter,
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
    includeMatch(
      target,
      node.minimumGeometricError,
      node.receiverCenterness,
      node.maximumPixelsPerMeter
    );
    return;
  }
  if (node.receivers) {
    for (const receiver of node.receivers) {
      if (intersectsReceiverCone(receiver, candidate)) {
        includeMatch(
          target,
          receiver.geometricError,
          receiver.centerness,
          receiver.pixelsPerMeter
        );
      }
    }
    return;
  }
  if (node.left) queryReceiverNode(node.left, candidate, target);
  if (node.right) queryReceiverNode(node.right, candidate, target);
};

/** The BVH uses the full far-end guard, but a nearby caster only sees the
 * finite disc's expansion at its own axial distance. Using the far-end width
 * at every depth admits unrelated neighbouring mesh families into each atomic
 * caster barrier. Box extents make this conservative for every disc ray, even
 * when the receiver and candidate span a nonzero light-space depth interval.
 */
const intersectsReceiverCone = (
  receiver: IndexedReceiver,
  candidate: THREE.Box3
): boolean => {
  const source = receiver.sourceBounds;
  if (
    candidate.max.z < source.min.z - DEPTH_EPSILON ||
    candidate.min.z >
      source.max.z + receiver.maximumCasterDistance + DEPTH_EPSILON
  )
    return false;
  const distance = Math.min(
    receiver.maximumCasterDistance,
    Math.max(0, candidate.max.z - source.min.z)
  );
  const guard = distance * receiver.angularSlope + DEPTH_EPSILON;
  return (
    candidate.max.x >= source.min.x - guard &&
    candidate.min.x <= source.max.x + guard &&
    candidate.max.y >= source.min.y - guard &&
    candidate.min.y <= source.max.y + guard
  );
};

/**
 * Builds a light-space BVH of the camera-visible receiver frontier swept
 * toward the sun. Tile hierarchy branches that miss every swept receiver
 * volume can be discarded before their payload is requested.
 */
export const createShadowReceiverMask = (
  sources: readonly ShadowReceiverSource[],
  tilesToShadowView: THREE.Matrix4,
  angularRadiusRadians = 0
): ShadowReceiverMask | null => {
  if (
    !Number.isFinite(angularRadiusRadians) ||
    angularRadiusRadians < 0 ||
    angularRadiusRadians >= Math.PI / 2
  )
    return null;
  // A retained corridor is a snapshot. The runtime reuses its matrix when
  // fitting the next view; old receiver bounds and candidate queries must
  // continue to use the same light-space transform until replacement commits.
  const projection = tilesToShadowView.clone();
  const angularSlope = Math.tan(angularRadiusRadians);
  const receivers: IndexedReceiver[] = [];
  for (const source of sources) {
    const casterError = source.casterGeometricError ?? source.geometricError;
    const sourceProjection = source.boundsTransform
      ? projection.clone().multiply(source.boundsTransform)
      : projection;
    const sourceBounds = source.bounds.clone().applyMatrix4(sourceProjection);
    const bounds = sourceBounds.clone();
    if (!isFiniteBox(bounds)) continue;
    const maximumCasterDistance = Math.max(0, source.maximumCasterDistance);
    bounds.max.z += maximumCasterDistance;
    // The retrieval mask must include the entire finite light disc, not only
    // the centre ray; distant penumbra contributors lie outside that ray.
    const guard = maximumCasterDistance * angularSlope;
    bounds.expandByScalar(DEPTH_EPSILON + guard);
    receivers.push({
      bounds,
      sourceBounds,
      maximumCasterDistance,
      angularSlope,
      geometricError:
        Number.isFinite(casterError) && casterError >= 0
          ? casterError
          : Number.MAX_VALUE,
      centerness: clamp(source.centerness, 0, 1),
      pixelsPerMeter:
        source.geometricError > DEPTH_EPSILON &&
        Number.isFinite(source.screenErrorPixels) &&
        source.screenErrorPixels! > 0
          ? source.screenErrorPixels! / source.geometricError
          : 0,
    });
  }
  if (receivers.length === 0) return null;

  const root = buildReceiverNode(receivers);
  const lightDepthRange = Math.max(
    DEPTH_EPSILON,
    root.bounds.max.z - root.bounds.min.z
  );
  const projectedCandidate = new THREE.Box3();
  const candidateProjection = new THREE.Matrix4();
  return {
    sourceCount: receivers.length,
    match(candidate, target, candidateTransform) {
      projectedCandidate
        .copy(candidate)
        .applyMatrix4(
          candidateTransform
            ? candidateProjection.copy(projection).multiply(candidateTransform)
            : projection
        );
      if (!isFiniteBox(projectedCandidate)) return false;
      target.receiverGeometricError = Number.POSITIVE_INFINITY;
      target.receiverCenterness = 0;
      target.receiverPixelsPerMeter = 0;
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
  errorTarget: number,
  receiverPixelsPerMeter = 0
): number => {
  if (receiverPixelsPerMeter > 0) {
    return Math.max(0, tileGeometricError) * receiverPixelsPerMeter;
  }
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
  errorTarget: number,
  candidateTransform?: THREE.Matrix4
): boolean => {
  const matched = mask.match(candidate, match, candidateTransform);
  target.inView = matched;
  if (matched) {
    // Traversal admission is relative to this receiver's current geometric
    // stage, not the final physical-pixel target. Using pixelsPerMeter here
    // would load final-resolution casters for a coarse bootstrap receiver.
    // Actual screen error remains available via receiverMatchedTileError for
    // public descriptors and final regional quality certification.
    target.error = receiverMatchedTileError(
      tileGeometricError,
      match.receiverGeometricError,
      errorTarget
    );
  }
  return matched;
};
