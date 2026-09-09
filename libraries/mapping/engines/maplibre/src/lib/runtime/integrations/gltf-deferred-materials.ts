import {
  DoubleSide,
  FrontSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  Texture,
} from "three";
import type {
  GLTF,
  GLTFLoaderPlugin,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";

const OPAQUE_ALPHA_MODE = "OPAQUE";
const UNLIT_EXTENSION = "KHR_materials_unlit";
const pendingMeshes = new WeakSet<Mesh>();
export const hasDeferredGltfMaterials = (mesh: Mesh): boolean =>
  pendingMeshes.has(mesh);

/** Geometry-only opaque casters. Alpha masks/blends and unknown material
 * extensions keep the normal path because they may affect shadow coverage.
 * Decision: TILE-OFFSCREEN-TEXTURES-20260909 in engines/maplibre/README.md.
 */
export const createDeferredGltfMaterials = (parser: GLTFParser) => {
  const skipped = new Set<number>();
  const placeholders = new Set<Material>();
  const slots: { mesh: Mesh; index: number }[] = [];
  let promotion: Promise<void> | null = null;
  let ready = false;
  let disposed = false;
  const lifetime = new AbortController();
  const texturesBeforePromotion = new Set<Texture>();
  // Mixed alpha/extension payloads and non-triangle primitives stay entirely
  // native. Their material dependencies can influence silhouette/coverage.
  const canDefer =
    (parser.json.materials ?? []).every(
      (definition: { alphaMode?: string; extensions?: object }) =>
        (definition.alphaMode ?? OPAQUE_ALPHA_MODE) === OPAQUE_ALPHA_MODE &&
        Object.keys(definition.extensions ?? {}).every(
          (name) => name === UNLIT_EXTENSION
        )
    ) &&
    (parser.json.meshes ?? []).every(
      (mesh: { primitives: { mode?: number; extensions?: object }[] }) =>
        mesh.primitives.every(
          (primitive) =>
            [4, 5, 6].includes(primitive.mode ?? 4) &&
            !Object.hasOwn(primitive.extensions ?? {}, "KHR_materials_variants")
        )
    );
  const plugin: GLTFLoaderPlugin = {
    name: "CARMA_DEFER_OPAQUE_MATERIALS",
    loadMaterial: (index) => {
      const definition = parser.json.materials?.[index];
      if (
        !canDefer ||
        !definition ||
        (definition.alphaMode ?? OPAQUE_ALPHA_MODE) !== OPAQUE_ALPHA_MODE ||
        Object.keys(definition.extensions ?? {}).some(
          (name) => name !== UNLIT_EXTENSION
        )
      )
        return null;
      const material = new MeshBasicMaterial({
        side: definition.doubleSided ? DoubleSide : FrontSide,
        colorWrite: false,
        depthWrite: false,
      });
      material.name = definition.name ?? "";
      parser.associations.set(material, { materials: index });
      skipped.add(index);
      placeholders.add(material);
      return Promise.resolve(material);
    },
    afterRoot: (result: GLTF) => {
      result.scene.traverse((object) => {
        if (object instanceof Mesh)
          for (const material of [object.material].flat()) {
            for (const value of Object.values(material))
              if (value instanceof Texture) texturesBeforePromotion.add(value);
          }
        if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
        const index = parser.associations.get(object.material)?.materials;
        if (index !== undefined && skipped.has(index)) {
          slots.push({ mesh: object, index });
          placeholders.add(object.material);
          pendingMeshes.add(object);
        }
      });
      ready = slots.length === 0;
      return null;
    },
  };
  const disposeMaterials = (
    materials: Iterable<Material>,
    disposeTextures = false
  ) => {
    const textures = new Set<Texture>();
    for (const material of materials) {
      if (disposeTextures)
        for (const value of Object.values(material)) {
          if (value instanceof Texture && !texturesBeforePromotion.has(value))
            textures.add(value);
        }
      material.dispose();
    }
    for (const texture of textures) {
      texture.dispose();
      if (
        typeof ImageBitmap !== "undefined" &&
        texture.image instanceof ImageBitmap
      )
        texture.image.close();
    }
  };
  const promote = (): Promise<void> => {
    if (disposed)
      return Promise.reject(new Error("Deferred tile materials disposed"));
    if (ready) return Promise.resolve();
    if (promotion) return promotion;
    promotion = (async () => {
      // GLTFParser integration seam: loadMaterial bypasses our getDependency
      // placeholder, assignFinalMaterial reapplies vertex-colour/normal/skinning
      // variants. Both are typed upstream, but implementation-sensitive; keep
      // pinned-loader regression tests. Geometry and embedded buffers are reused.
      const clearImageCaches = () => {
        const native = parser as GLTFParser & {
          cache: { remove: (key: string) => void };
          textureCache: object;
          sourceCache: object;
        };
        if (!disposed && canDefer) {
          (parser.json.textures ?? []).forEach((_: unknown, index: number) =>
            native.cache?.remove(`texture:${index}`)
          );
          native.textureCache = {};
          native.sourceCache = {};
        }
      };
      const loading = Promise.allSettled(
        [...skipped].map(
          async (index) => [index, await parser.loadMaterial(index)] as const
        )
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancel = () => {};
      const interrupted = new Promise<never>((_, reject) => {
        cancel = () => reject(lifetime.signal.reason);
        lifetime.signal.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(
          () => reject(new Error("Deferred tile texture timeout")),
          30_000
        );
      });
      const results = await Promise.race([loading, interrupted])
        .catch((error) => {
          // ImageBitmapLoader has no abort API. Release the queue now and dispose
          // any late results; stale work cannot publish into a replacement tile.
          void loading.then((settled) =>
            disposeMaterials(
              settled.flatMap((result) =>
                result.status === "fulfilled" ? [result.value[1]] : []
              ),
              true
            )
          );
          clearImageCaches();
          throw error;
        })
        .finally(() => {
          clearTimeout(timer);
          lifetime.signal.removeEventListener("abort", cancel);
        });
      const entries = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      const failed = results.find((result) => result.status === "rejected");
      const missingTexture = entries.some(([index, material]) => {
        const definition = parser.json.materials[index];
        const maps = material as Material & Record<string, unknown>;
        return (
          (definition.pbrMetallicRoughness?.baseColorTexture && !maps.map) ||
          (definition.normalTexture && !maps.normalMap) ||
          (definition.emissiveTexture && !maps.emissiveMap) ||
          (definition.occlusionTexture && !maps.aoMap) ||
          (definition.pbrMetallicRoughness?.metallicRoughnessTexture &&
            (!maps.metalnessMap || !maps.roughnessMap))
        );
      });
      if (disposed || failed || missingTexture) {
        disposeMaterials(
          entries.map(([, material]) => material),
          true
        );
        // GLTFLoader memoizes rejected image promises and even resolves failed
        // textures as null. Clear only this wholly opaque payload's image caches
        // to allow bounded retries, never its reusable buffers or geometry.
        clearImageCaches();
        throw disposed
          ? new Error("Deferred tile materials disposed")
          : failed?.reason ?? new Error("Deferred tile texture unavailable");
      }
      const materials = new Map(entries);
      // Commit all texture/material variants atomically for this payload.
      for (const { mesh, index } of slots) {
        mesh.material = materials.get(index)!;
        parser.assignFinalMaterial(mesh);
      }
      ready = true;
      for (const { mesh } of slots) pendingMeshes.delete(mesh);
      disposeMaterials(placeholders);
      placeholders.clear();
    })().catch((error) => {
      promotion = null;
      throw error;
    });
    return promotion;
  };
  return {
    plugin,
    promote,
    isReady: () => ready,
    skippedMaterialCount: () => skipped.size,
    dispose: () => {
      disposed = true;
      lifetime.abort(new Error("Deferred tile materials disposed"));
      disposeMaterials(placeholders);
      placeholders.clear();
      for (const { mesh } of slots) pendingMeshes.delete(mesh);
    },
  };
};
