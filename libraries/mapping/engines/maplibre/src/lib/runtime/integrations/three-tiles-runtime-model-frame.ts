import * as THREE from "three";

import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";

/** Reads tile and model bounds in the stable runtime frame. */
export function createThreeTilesModelFrame(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    "tiles" | "frameFromTiles" | "orientationGroup" | "modelLocalBounds"
  >
) {
  /** Product of the local matrices from `node` up to, excluding, `stop`. */
  const localChain = (
    node: THREE.Object3D,
    stop: THREE.Object3D | null,
    target: THREE.Matrix4
  ): THREE.Matrix4 => {
    target.identity();
    for (
      let current: THREE.Object3D | null = node;
      current && current !== stop;
      current = current.parent
    ) {
      if (current.matrixAutoUpdate) current.updateMatrix();
      target.premultiply(current.matrix);
    }
    return target;
  };
  const updateFrameFromTiles: ThreeTilesRuntimeServices["updateFrameFromTiles"] =
    () => {
      if (!runtimeState.tiles) return runtimeState.frameFromTiles.identity();
      // Up to and including the runtime root; its parent is the frame host,
      // the layer's local-frame group or the scene.
      return localChain(
        runtimeState.tiles.group,
        runtimeState.orientationGroup.parent,
        runtimeState.frameFromTiles
      );
    };
  const modelChain = new THREE.Matrix4();
  const readModelFrameBounds: ThreeTilesRuntimeServices["readModelFrameBounds"] =
    (model: THREE.Object3D, target: THREE.Box3): THREE.Box3 => {
      // Tile payloads are immutable after GLTF publication, so the bounds in
      // the model's own space are walked once per model (walking every
      // vertex-bearing descendant per corridor query cost 15.6 s in one
      // startup trace). Per read only the local chain from the model up to
      // the runtime root is applied: a moved model is reflected, and a
      // local-frame refit moves the frame group, never this result, so keys
      // derived from it survive the refit.
      let bounds = runtimeState.modelLocalBounds.get(model);
      if (!bounds) {
        const localBounds = new THREE.Box3();
        const box = new THREE.Box3();
        const matrix = new THREE.Matrix4();
        model.traverse((object) => {
          const geometry = (object as THREE.Mesh).geometry as
            | THREE.BufferGeometry
            | undefined;
          if (!geometry) return;
          if (geometry.boundingBox === null) geometry.computeBoundingBox();
          if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
          box
            .copy(geometry.boundingBox)
            .applyMatrix4(localChain(object, model, matrix));
          localBounds.union(box);
        });
        bounds = localBounds;
        runtimeState.modelLocalBounds.set(model, bounds);
      }
      const frameFromModel = localChain(
        model,
        runtimeState.tiles?.group ?? null,
        modelChain
      ).premultiply(updateFrameFromTiles());
      return target.copy(bounds).applyMatrix4(frameFromModel);
    };

  return { updateFrameFromTiles, readModelFrameBounds };
}
