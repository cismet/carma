import * as THREE from "three";
import { meshShadowStageError } from "@carma-mapping/engines/maplibre";
import type { ShadowReceiverCell } from "./shadow-page-plan";

type ReceiverVolume = Readonly<{
  id: string;
  minimum: readonly [number, number, number];
  maximum: readonly [number, number, number];
  loadReason?: "viewport" | "shadow";
}>;

/** Exact identity for read-only queries within one committed render snapshot. */
export const shadowRegionQueryKey = (
  bounds: THREE.Box3,
  errorPixels?: number,
  receiverBounds?: THREE.Box3
): string =>
  JSON.stringify([
    bounds.min.toArray(),
    bounds.max.toArray(),
    errorPixels,
    receiverBounds?.min.toArray(),
    receiverBounds?.max.toArray(),
  ]);

/** Changes to the published cut, not speculative loader arrivals. Keep old and
 * new bounds for removals/moves; view-relative error and load reason are not
 * geometry changes. Native IDs identify immutable tile payloads for the runtime.
 */
export const getChangedShadowVolumeBounds = (
  previous: readonly ReceiverVolume[],
  current: readonly ReceiverVolume[]
): readonly THREE.Box3[] => {
  const before = new Map(previous.map((volume) => [volume.id, volume]));
  const changed: THREE.Box3[] = [];
  const append = (volume: ReceiverVolume) =>
    changed.push(
      new THREE.Box3(
        new THREE.Vector3(...volume.minimum),
        new THREE.Vector3(...volume.maximum)
      )
    );
  for (const volume of current) {
    const old = before.get(volume.id);
    const same =
      old &&
      volume.minimum.every((value, axis) => value === old.minimum[axis]) &&
      volume.maximum.every((value, axis) => value === old.maximum[axis]);
    if (!same) {
      if (old) append(old);
      append(volume);
    }
    before.delete(volume.id);
  }
  for (const volume of before.values()) append(volume);
  return changed;
};

/** A native receiver may span several disjoint display fragments. Acknowledge
 * it only after every currently visible intersecting fragment was drawn with
 * current hard-or-soft visibility. Offscreen casters are never receivers, and
 * a retained but obsolete capture is not a refinement acknowledgement.
 */
export const getPresentedShadowReceiverIds = (
  volumes: readonly ReceiverVolume[],
  visiblePages: readonly ShadowReceiverCell[],
  presentedPages: readonly ShadowReceiverCell[]
): readonly string[] => {
  const presented = new Set(presentedPages.map(({ id }) => id));
  return volumes
    .filter((volume) => {
      if (volume.loadReason === "shadow") return false;
      const pages = visiblePages.filter(
        ({ bounds }) =>
          volume.minimum[0] < bounds.max.x &&
          volume.maximum[0] > bounds.min.x &&
          volume.minimum[2] < bounds.max.z &&
          volume.maximum[2] > bounds.min.z
      );
      return pages.length > 0 && pages.every(({ id }) => presented.has(id));
    })
    .map(({ id }) => id);
};

/** Shared Three world is east/up/south in metres; persistent coordinates are
 * normalized Mercator east/south/up. No observer origin enters cache identity.
 */
export const shadowSceneWorldBasis = (
  east: number,
  south: number,
  unitsPerMeter: number
): THREE.Matrix4 => {
  if (
    ![east, south, unitsPerMeter].every(Number.isFinite) ||
    unitsPerMeter <= 0
  )
    throw new RangeError("Invalid shared-scene Mercator basis");
  return new THREE.Matrix4().set(
    unitsPerMeter,
    0,
    0,
    east,
    0,
    0,
    unitsPerMeter,
    south,
    0,
    unitsPerMeter,
    0,
    0,
    0,
    0,
    0,
    1
  );
};

/** The hard-shadow stage uses the published receiver cut, not a requested
 * target which may still be downloading. Unknown error fails back to target.
 */
export const shadowReceiverStageError = (
  bounds: THREE.Box3,
  volumes: readonly Readonly<{
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
    errorPixels?: number;
    loadReason?: "viewport" | "shadow";
  }>[],
  target: number
): number =>
  meshShadowStageError(
    volumes.reduce((error, volume) => {
      // A caster above the same footprint must not relax the receiver stage.
      // Its observer-space error is not the corridor's receiver-relative error.
      if (volume.loadReason === "shadow") return error;
      const [x0, , z0] = volume.minimum;
      const [x1, , z1] = volume.maximum;
      const overlaps =
        x0 < bounds.max.x &&
        x1 > bounds.min.x &&
        z0 < bounds.max.z &&
        z1 > bounds.min.z;
      return overlaps && Number.isFinite(volume.errorPixels)
        ? Math.max(error, volume.errorPixels!)
        : error;
    }, target),
    target
  );
