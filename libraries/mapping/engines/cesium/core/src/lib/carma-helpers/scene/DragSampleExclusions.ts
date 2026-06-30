import type { Scene } from "@carma-cesium";

/**
 * Anything that can be removed from a render pass by toggling `show` — a
 * `Primitive`, a `PolylineCollection`, an axis visualizer, etc.
 */
export type HideablePrimitive = { show: boolean };

export type DragSampleOccluderResolver = () => readonly HideablePrimitive[];

const occluderResolverByScene = new WeakMap<Scene, DragSampleOccluderResolver>();

/**
 * Register (or clear, with `null`) the resolver that lists primitives which must
 * be excluded from drag depth-sampling for `scene` — e.g. the measurement lines
 * attached to the node currently being dragged. Keyed by `scene` so a drag tool
 * (gizmo) and the geometry layer (annotations) can share it without threading
 * props through their separate hook trees, mirroring the `liveAnchors` channel.
 */
export const setSceneDragSampleOccluderResolver = (
  scene: Scene,
  resolver: DragSampleOccluderResolver | null
): void => {
  if (resolver) {
    occluderResolverByScene.set(scene, resolver);
  } else {
    occluderResolverByScene.delete(scene);
  }
};

/**
 * Primitives to hide from drag depth-sampling for `scene` this moment, or an
 * empty array when nothing is registered (no active drag with attached geometry).
 */
export const getSceneDragSampleOccluders = (
  scene: Scene
): readonly HideablePrimitive[] => occluderResolverByScene.get(scene)?.() ?? [];
