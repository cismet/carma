import {
  BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  Object3D,
  Material,
} from "three";
import { createTerrainBatch } from "./batch";
import {
  canInstanceTerrainMesh,
  sameTerrainTopology,
  supportsTerrainInstanceTransform,
} from "./eligibility";
import { geometryBufferBytes, terrainTextureLayout } from "./packing";

export type DisplacedTerrainOptions = Readonly<{
  /** Use renderer.capabilities.maxTextureSize and MAX_ARRAY_TEXTURE_LAYERS. */
  maxTextureSize?: number;
  maxArrayLayers?: number;
  tilesPerBatch?: number;
  admitRetainedBytes?: (additionalBytes: number) => boolean;
}>;
export type DisplacedTerrainMetrics = Readonly<{
  sourceBytes: number;
  displacedBytes: number;
  tiles: number;
  instancedTiles: number;
  fallbackTiles: number;
  batches: number;
  /** Dirty vertex layers and instance matrices marked for upload; excludes shared
   * geometry, fallback uploads and driver overhead. */
  uploadedBytes: number;
}>;

const visibleIn = (object: Object3D, source: Object3D): boolean => {
  for (
    let current: Object3D | null = object;
    current;
    current = current.parent
  ) {
    if (!current.visible) return false;
    if (current === source) return true;
  }
  return false;
};
const attributeIds = new WeakMap<object, number>();
let nextAttributeId = 0;
const attributeId = (attribute: object | null | undefined): number => {
  if (!attribute) return -1;
  let id = attributeIds.get(attribute);
  if (id === undefined) {
    id = nextAttributeId++;
    attributeIds.set(attribute, id);
  }
  return id;
};
const topologyStamp = (mesh: Mesh, eligible: boolean): string => {
  const geometry = mesh.geometry;
  const index = geometry.index;
  const uv = geometry.getAttribute("uv") as BufferAttribute | undefined;
  return [
    mesh.uuid,
    geometry.uuid,
    geometry.getAttribute("position")?.count,
    attributeId(index),
    index?.version,
    attributeId(uv),
    uv?.version,
    Array.isArray(mesh.material) ? "array" : mesh.material.uuid,
    eligible,
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.renderOrder,
    mesh.layers.mask,
    mesh.frustumCulled,
  ].join(":");
};
const sameDrawState = (a: Mesh, b: Mesh): boolean =>
  a.material === b.material &&
  a.castShadow === b.castShadow &&
  a.receiveShadow === b.receiveShadow &&
  a.renderOrder === b.renderOrder &&
  a.layers.mask === b.layers.mask &&
  a.frustumCulled === b.frustumCulled;

/**
 * Optional prepared-vertex presentation; tile selection and publication stay
 * entirely with the source manager. Source CPU geometry remains for exact picking. Source and target must belong
 * to independent rendering trees; the source manager is never mutated or hidden.
 * Allocations are representation payload estimates, including CPU + GPU copies,
 * excluding source-owned image textures, renderer internals and driver overhead.
 */
export const createDisplacedTerrainPresentation = (
  source: Object3D,
  target: Object3D,
  options: DisplacedTerrainOptions = {}
) => {
  const contains = (ancestor: Object3D, object: Object3D): boolean => {
    for (
      let current: Object3D | null = object;
      current;
      current = current.parent
    ) {
      if (current === ancestor) return true;
    }
    return false;
  };
  if (contains(source, target) || contains(target, source)) {
    throw new RangeError(
      "Terrain source and target must have independent rendering roots"
    );
  }
  const root = new Group();
  root.name = "Displaced terrain presentation";
  target.add(root);
  const inverse = new Matrix4();
  const maxTextureSize = options.maxTextureSize ?? 4096;
  const requestedCapacity = Math.min(
    options.tilesPerBatch ?? 8,
    options.maxArrayLayers ?? 8
  );
  if (
    ![maxTextureSize, requestedCapacity].every(
      (value) => Number.isInteger(value) && value > 0
    )
  ) {
    target.remove(root);
    throw new RangeError(
      "Terrain texture capabilities must be positive integers"
    );
  }
  const capacity = Math.min(8, requestedCapacity);
  const relative = new Matrix4();
  const canPresent = (mesh: Mesh) =>
    canInstanceTerrainMesh(mesh) &&
    supportsTerrainInstanceTransform(
      relative.multiplyMatrices(inverse, mesh.matrixWorld)
    );
  const meshStamp = (mesh: Mesh) => topologyStamp(mesh, canPresent(mesh));
  let batches: ReturnType<typeof createTerrainBatch>[] = [];
  let fallbacks: Array<{
    source: Mesh;
    mesh: Mesh;
    materials: Material[];
    materialVersions: number[];
  }> = [];
  const disposeFallbacks = () => {
    for (const fallback of fallbacks)
      for (const material of fallback.materials) material.dispose();
    fallbacks = [];
  };
  const batchStamps = new Map<ReturnType<typeof createTerrainBatch>, string>();
  let previousStamp = "";
  let revision = 0;
  let disposed = false;
  let metrics: DisplacedTerrainMetrics = {
    sourceBytes: 0,
    displacedBytes: 0,
    tiles: 0,
    instancedTiles: 0,
    fallbackTiles: 0,
    batches: 0,
    uploadedBytes: 0,
  };
  const clear = () => {
    for (const batch of batches) batch.dispose();
    batches = [];
    batchStamps.clear();
    disposeFallbacks();
    root.clear();
  };
  const rebuild = (sources: Mesh[]) => {
    const remaining = new Set(sources);
    const retained: typeof batches = [];
    for (const batch of batches) {
      const stamp = batch.sources.map(meshStamp).join("|");
      if (
        batch.sources.every((mesh) => remaining.has(mesh)) &&
        batchStamps.get(batch) === stamp
      ) {
        retained.push(batch);
        for (const mesh of batch.sources) remaining.delete(mesh);
      } else {
        batch.dispose();
        batchStamps.delete(batch);
      }
    }
    batches = retained;
    disposeFallbacks();
    root.clear();
    for (const batch of retained) root.add(batch.mesh);
    const addFallback = (mesh: Mesh) => {
      const clone = mesh.clone(false);
      const originals = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const materials = originals.map((material) => {
        const copy = material.clone();
        copy.onBeforeCompile = material.onBeforeCompile;
        copy.customProgramCacheKey = material.customProgramCacheKey;
        return copy;
      });
      clone.material = Array.isArray(mesh.material) ? materials : materials[0];
      clone.matrixAutoUpdate = false;
      clone.onBeforeRender = mesh.onBeforeRender;
      clone.onAfterRender = mesh.onAfterRender;
      clone.onBeforeShadow = mesh.onBeforeShadow;
      clone.onAfterShadow = mesh.onAfterShadow;
      clone.customDepthMaterial = mesh.customDepthMaterial;
      clone.customDistanceMaterial = mesh.customDistanceMaterial;
      clone.raycast = (raycaster, intersections) =>
        mesh.raycast(raycaster, intersections);
      fallbacks.push({
        source: mesh,
        mesh: clone,
        materials,
        materialVersions: originals.map((material) => material.version),
      });
      root.add(clone);
    };
    const compatible: Mesh[][] = [];
    for (const mesh of remaining) {
      const layout = canPresent(mesh)
        ? terrainTextureLayout(
            mesh.geometry.getAttribute("position").count,
            maxTextureSize
          )
        : undefined;
      if (!layout) {
        addFallback(mesh);
        continue;
      }
      const group = compatible.find(
        (group) =>
          group.length < capacity &&
          sameDrawState(group[0], mesh) &&
          sameTerrainTopology(group[0], mesh)
      );
      if (group) group.push(mesh);
      else compatible.push([mesh]);
    }
    for (const group of compatible) {
      // A single tile cannot amortize its additional dummy buffers and matrix.
      if (group.length === 1) {
        addFallback(group[0]);
        continue;
      }
      const layout = terrainTextureLayout(
        group[0].geometry.getAttribute("position").count,
        maxTextureSize
      )!;
      const additionalBytes =
        2 *
        (layout.vertexCount * 6 +
          group[0].geometry.index!.array.byteLength +
          (group[0].geometry.getAttribute("uv")?.array.byteLength ?? 0) +
          group.length * (4 + 64 + layout.floatsPerLayer * 4));
      if (
        options.admitRetainedBytes &&
        !options.admitRetainedBytes(additionalBytes)
      ) {
        for (const mesh of group) addFallback(mesh);
        continue;
      }
      const batch = createTerrainBatch(group, layout);
      batch.mesh.frustumCulled = group[0].frustumCulled;
      batches.push(batch);
      batchStamps.set(batch, group.map(meshStamp).join("|"));
      root.add(batch.mesh);
    }
  };

  return {
    get revision() {
      return revision;
    },
    retainedBytes: () => batches.reduce((sum, batch) => sum + batch.bytes(), 0),
    usesMaterial: (
      candidate: Mesh["material"],
      sourceMaterial: Mesh["material"]
    ) =>
      batches.some(
        (batch) =>
          batch.mesh.material === candidate &&
          batch.sources[0].material === sourceMaterial
      ) ||
      fallbacks.some(
        (fallback) =>
          fallback.mesh.material === candidate &&
          fallback.source.material === sourceMaterial
      ),
    update: (): DisplacedTerrainMetrics => {
      if (disposed) return metrics;
      source.updateWorldMatrix(true, true);
      target.updateWorldMatrix(true, false);
      inverse.copy(target.matrixWorld).invert();
      const sources: Mesh[] = [];
      source.traverse((object) => {
        if (object instanceof Mesh && visibleIn(object, source))
          sources.push(object);
      });
      const nextStamp = sources.map(meshStamp).join("|");
      if (nextStamp !== previousStamp) {
        rebuild(sources);
        previousStamp = nextStamp;
        revision += 1;
      }
      let uploadedBytes = 0;
      for (const batch of batches) uploadedBytes += batch.update(inverse);
      for (const fallback of fallbacks) {
        fallback.mesh.matrix.multiplyMatrices(
          inverse,
          fallback.source.matrixWorld
        );
        fallback.mesh.matrixWorldNeedsUpdate = true;
        fallback.mesh.geometry = fallback.source.geometry;
        const sourceMaterials = Array.isArray(fallback.source.material)
          ? fallback.source.material
          : [fallback.source.material];
        fallback.materials.forEach((material, index) => {
          const userData = material.userData;
          const defines = material.defines;
          material.copy(sourceMaterials[index]);
          material.userData = userData;
          material.defines = { ...sourceMaterials[index].defines, ...defines };
          if (
            fallback.materialVersions[index] !== sourceMaterials[index].version
          ) {
            material.needsUpdate = true;
            fallback.materialVersions[index] = sourceMaterials[index].version;
          }
        });
        fallback.mesh.customDepthMaterial = fallback.source.customDepthMaterial;
        fallback.mesh.customDistanceMaterial =
          fallback.source.customDistanceMaterial;
        fallback.mesh.morphTargetInfluences =
          fallback.source.morphTargetInfluences;
        fallback.mesh.onBeforeRender = fallback.source.onBeforeRender;
        fallback.mesh.onAfterRender = fallback.source.onAfterRender;
        fallback.mesh.onBeforeShadow = fallback.source.onBeforeShadow;
        fallback.mesh.onAfterShadow = fallback.source.onAfterShadow;
      }
      const instancedTiles = batches.reduce(
        (sum, batch) => sum + batch.sources.length,
        0
      );
      metrics = {
        sourceBytes:
          2 * geometryBufferBytes(sources.map((mesh) => mesh.geometry)),
        displacedBytes:
          batches.reduce((sum, batch) => sum + batch.bytes(), 0) +
          2 * geometryBufferBytes(fallbacks.map(({ mesh }) => mesh.geometry)),
        tiles: sources.length,
        instancedTiles,
        fallbackTiles: fallbacks.length,
        batches: batches.length,
        uploadedBytes,
      };
      return metrics;
    },
    dispose: (): void => {
      if (disposed) return;
      clear();
      target.remove(root);
      disposed = true;
    },
  };
};
