import type { Tile } from "3d-tiles-renderer/core";
import { Box3, Matrix4 } from "three";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import type { RuntimeTile } from "./three-tiles-runtime-types";

const isFiniteBox = (box: Box3) =>
  Number.isFinite(box.min.x) &&
  Number.isFinite(box.min.y) &&
  Number.isFinite(box.min.z) &&
  Number.isFinite(box.max.x) &&
  Number.isFinite(box.max.y) &&
  Number.isFinite(box.max.z);

/** Restrict spatial demand to the root certificate in tiles-group coordinates.
 * Keep contained OBBs intact; partial overlap uses a conservative intersection
 * in the root's own axes. Unknown metadata never removes a traversal fallback. */
export const createRootTileDomainClip = (
  getRoot: () => Tile | null | undefined
) => {
  const domain = new Box3();
  const rootFromCandidate = new Matrix4();
  const rootTransform = new Matrix4();
  const lastRootTransform = new Matrix4();
  const lastDomain = new Box3();
  const inverseRoot = new Matrix4();
  let rootTransformReady = false;
  let domainReady = false;
  let revision = 0;
  const candidate = new Box3();
  const unavailable = () => {
    if (domainReady) revision += 1;
    domainReady = false;
    return false;
  };
  const readDomain = (): boolean => {
    const root = getRoot() as RuntimeTile | null | undefined;
    const volume = root?.engineData?.boundingVolume;
    if (!volume?.getAABB) return unavailable();
    try {
      domain.makeEmpty();
      readOrientedTileBounds(volume, domain, rootTransform);
    } catch {
      // The renderer can expose a volume before its source certificate exists.
      return unavailable();
    }
    if (
      domain.isEmpty() ||
      !isFiniteBox(domain) ||
      !rootTransform.elements.every(Number.isFinite) ||
      rootTransform.determinant() === 0
    )
      return unavailable();
    const transformChanged =
      !rootTransformReady || !lastRootTransform.equals(rootTransform);
    if (!domainReady || transformChanged || !lastDomain.equals(domain))
      revision += 1;
    domainReady = true;
    lastDomain.copy(domain);
    if (transformChanged) {
      inverseRoot.copy(rootTransform).invert();
      lastRootTransform.copy(rootTransform);
      rootTransformReady = true;
    }
    return true;
  };
  const clip = (bounds: Box3, transform: Matrix4): boolean => {
    if (
      !readDomain() ||
      !transform.elements.every(Number.isFinite) ||
      transform.determinant() === 0
    )
      return true;
    rootFromCandidate.copy(inverseRoot).multiply(transform);
    candidate.copy(bounds).applyMatrix4(rootFromCandidate);
    if (!isFiniteBox(candidate)) return true;
    if (!domain.intersectsBox(candidate)) return false;
    if (domain.containsBox(candidate)) return true;
    bounds.copy(candidate.intersect(domain));
    transform.copy(rootTransform);
    return true;
  };
  return Object.assign(clip, {
    revision: () => {
      readDomain();
      return revision;
    },
  });
};
