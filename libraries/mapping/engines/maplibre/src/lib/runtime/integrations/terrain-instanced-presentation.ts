import { Group, type Material, type Object3D, type WebGLRenderer } from "three";
import { createDisplacedTerrainPresentation } from "@carma-mapping/engines/three/primitives/rendering";

/** Retains manager-owned meshes for queries while rendering one shared cut. */
export const createTerrainInstancedPresentation = (
  root: Object3D,
  options: {
    admitRetainedBytes: (bytes: number) => boolean;
    onChanged: () => void;
    onError: (error: unknown) => void;
  }
) => {
  let presentation: ReturnType<
    typeof createDisplacedTerrainPresentation
  > | null = null;
  let source: Group | null = null;
  let target: Group | null = null;
  let failed = false;
  const release = () => {
    if (!presentation) return;
    presentation.dispose();
    for (const child of [...source!.children]) root.add(child);
    root.remove(source!, target!);
    presentation = null;
    source = null;
    target = null;
    options.onChanged();
  };
  return {
    root: () => target ?? root,
    retainedBytes: () => presentation?.retainedBytes() ?? 0,
    usesMaterial: (candidate: Material, material: Material) =>
      presentation?.usesMaterial(candidate, material) ?? candidate === material,
    release,
    update: (renderer?: WebGLRenderer) => {
      if (!renderer || failed) return;
      try {
        if (!presentation) {
          const gl = renderer.getContext();
          if (!("MAX_ARRAY_TEXTURE_LAYERS" in gl)) {
            failed = true;
            return;
          }
          source = new Group();
          target = new Group();
          source.name = "Terrain query geometry";
          target.name = "Instanced terrain";
          root.add(source, target);
          presentation = createDisplacedTerrainPresentation(source, target, {
            maxTextureSize: renderer.capabilities.maxTextureSize,
            maxArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
            admitRetainedBytes: options.admitRetainedBytes,
          });
        }
        for (const child of [...root.children])
          if (child !== source && child !== target) source!.add(child);
        const revision = presentation.revision;
        source!.visible = true;
        const metrics = presentation.update();
        source!.visible = false;
        if (revision !== presentation.revision) options.onChanged();
        return metrics;
      } catch (error) {
        // Restore the complete cut instead of repeatedly failing each frame.
        if (source) source.visible = true;
        if (presentation) release();
        else if (source && target) root.remove(source, target);
        failed = true;
        options.onError(error);
      }
    },
    dispose: release,
  };
};
