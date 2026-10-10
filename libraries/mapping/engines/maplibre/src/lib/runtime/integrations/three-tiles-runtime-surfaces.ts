import * as THREE from "three";
import { runMeshPreparationTask } from "./mesh-preparation-client";
import type { SurfaceNormalizationPart } from "../../core/separated-surface-normalization";

import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";

type NormalizationOptions = NonNullable<
  Parameters<typeof runMeshPreparationTask>[1]
>;
type PendingNormalization = {
  controller: AbortController;
  promise: Promise<void>;
};
const pendingRoots = new WeakMap<THREE.Object3D, PendingNormalization>();
const attributeVersion = (
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
) => ("data" in attribute ? attribute.data.version : attribute.version);
const abortError = () =>
  new DOMException("Surface preparation aborted", "AbortError");
const waitForPreparation = (promise: Promise<void>, signal?: AbortSignal) => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
};

/** surfaces responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesSurfaces(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    "separatedSurfaceRenderSides" | "normalizedSeparatedSurfaceGeometries"
  >
) {
  const isSeparatedBuildingSurface: ThreeTilesRuntimeServices["isSeparatedBuildingSurface"] =
    (material: THREE.Material) => {
      const surfaceName = material.name.trim().toLowerCase();
      return surfaceName === "roof" || surfaceName === "wall";
    };

  const isRenderedBuildingSurface: ThreeTilesRuntimeServices["isRenderedBuildingSurface"] =
    (material: THREE.Material) => {
      const sourceName = material.name.trim().toLowerCase().split(" · ", 1)[0];
      return sourceName === "roof" || sourceName === "wall";
    };

  const resolveRenderSide: ThreeTilesRuntimeServices["resolveRenderSide"] = (
    material: THREE.Material
  ) =>
    runtimeState.separatedSurfaceRenderSides.get(material) ?? THREE.FrontSide;

  const asMaterialArray: ThreeTilesRuntimeServices["asMaterialArray"] = (
    material: THREE.Material | THREE.Material[]
  ): THREE.Material[] => (Array.isArray(material) ? material : [material]);

  const normalizeSeparatedBuildingSurfaces = (
    root: THREE.Object3D,
    options: NormalizationOptions = {}
  ): Promise<void> => {
    if (options.signal?.aborted) return Promise.reject(abortError());
    const existing = pendingRoots.get(root);
    if (existing && !existing.controller.signal.aborted)
      return waitForPreparation(existing.promise, options.signal);

    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const disposed = new Set<THREE.BufferGeometry>();
    const disposeListeners = new Map<THREE.BufferGeometry, () => void>();
    type Part = {
      mesh: THREE.Mesh;
      parent: THREE.Object3D;
      materials: THREE.Material[];
      material: THREE.Material | THREE.Material[];
      geometry: THREE.BufferGeometry;
      position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      featureId: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
      index: THREE.BufferAttribute;
      positionVersion: number;
      featureVersion: number;
      indexVersion: number;
      normal:
        | THREE.BufferAttribute
        | THREE.InterleavedBufferAttribute
        | undefined;
      normalVersion: number | undefined;
    };
    const groups: Part[][] = [];
    const collected = new Set<THREE.BufferGeometry>();
    root.traverse((parent) => {
      const names = new Set<string>();
      const parts: Part[] = [];
      for (const child of parent.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const geometry = mesh.geometry;
        if (
          runtimeState.normalizedSeparatedSurfaceGeometries.has(geometry) ||
          collected.has(geometry)
        )
          continue;
        const materials = asMaterialArray(mesh.material);
        for (const material of materials) {
          const name = material.name.trim().toLowerCase();
          if (name === "roof" || name === "wall") names.add(name);
        }
        if (!materials.some(isSeparatedBuildingSurface)) continue;
        const position = geometry.getAttribute("position");
        const featureId = geometry.getAttribute("_feature_id_0");
        const index = geometry.getIndex();
        if (!position || !featureId || !index) continue;
        parts.push({
          mesh,
          parent,
          material: mesh.material,
          materials,
          geometry,
          position,
          featureId,
          index,
          positionVersion: attributeVersion(position),
          featureVersion: attributeVersion(featureId),
          indexVersion: index.version,
          normal: geometry.getAttribute("normal"),
          normalVersion: geometry.getAttribute("normal")
            ? attributeVersion(geometry.getAttribute("normal"))
            : undefined,
        });
      }
      if (names.has("roof") && names.has("wall")) {
        groups.push(parts);
        for (const part of parts) collected.add(part.geometry);
      }
    });
    for (const part of groups.flat()) {
      if (disposeListeners.has(part.geometry)) continue;
      const onDispose = () => {
        disposed.add(part.geometry);
        controller.abort();
      };
      disposeListeners.set(part.geometry, onDispose);
      part.geometry.addEventListener("dispose", onDispose);
    }
    const assertCurrent = (p: Part) => {
      if (controller.signal.aborted) throw abortError();
      let ancestor: THREE.Object3D | null = p.parent;
      while (ancestor && ancestor !== root) ancestor = ancestor.parent;
      if (
        ancestor !== root ||
        disposed.has(p.geometry) ||
        p.mesh.parent !== p.parent ||
        p.mesh.geometry !== p.geometry ||
        p.mesh.material !== p.material ||
        p.geometry.getAttribute("position") !== p.position ||
        p.geometry.getAttribute("_feature_id_0") !== p.featureId ||
        p.geometry.getIndex() !== p.index ||
        p.geometry.getAttribute("normal") !== p.normal ||
        (p.normal && attributeVersion(p.normal) !== p.normalVersion) ||
        attributeVersion(p.position) !== p.positionVersion ||
        attributeVersion(p.featureId) !== p.featureVersion ||
        p.index.version !== p.indexVersion
      )
        throw abortError();
    };
    let snapshotStarted = performance.now();
    const copyAttribute = async (
      part: Part,
      attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
      itemSize: 1 | 3,
      target: Float64Array | Uint32Array
    ) => {
      assertCurrent(part);
      // Bulk conversion is safe only when raw values have the same meaning as
      // accessors. Float16, normalized and interleaved attributes use getX/Y/Z.
      const contiguous =
        !("data" in attribute) &&
        !attribute.normalized &&
        attribute.itemSize === itemSize &&
        attribute.getX === THREE.BufferAttribute.prototype.getX &&
        (itemSize === 1 ||
          (attribute.getY === THREE.BufferAttribute.prototype.getY &&
            attribute.getZ === THREE.BufferAttribute.prototype.getZ));
      for (let start = 0; start < attribute.count; start += 4096) {
        const end = Math.min(start + 4096, attribute.count);
        if (contiguous) {
          target.set(
            attribute.array.subarray(start * itemSize, end * itemSize),
            start * itemSize
          );
        } else {
          for (let i = start; i < end; i++) {
            target[i * itemSize] = attribute.getX(i);
            if (itemSize === 3) {
              target[i * 3 + 1] = attribute.getY(i);
              target[i * 3 + 2] = attribute.getZ(i);
            }
          }
        }
        if (performance.now() - snapshotStarted >= 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          snapshotStarted = performance.now();
          assertCurrent(part);
        }
      }
      assertCurrent(part);
    };
    const entry: PendingNormalization = {
      controller,
      promise: Promise.resolve(),
    };
    pendingRoots.set(root, entry);
    entry.promise = (async () => {
      const inputs: SurfaceNormalizationPart[][] = [];
      for (const parts of groups) {
        const prepared: SurfaceNormalizationPart[] = [];
        for (const part of parts) {
          assertCurrent(part);
          const positions = new Float64Array(part.position.count * 3);
          const featureIds = new Float64Array(part.featureId.count);
          const indices = new Uint32Array(part.index.count);
          await copyAttribute(part, part.position, 3, positions);
          await copyAttribute(part, part.featureId, 1, featureIds);
          await copyAttribute(part, part.index, 1, indices);
          prepared.push({ positions, featureIds, indices });
        }
        inputs.push(prepared);
      }
      // No snapshot of a changed scene may enter the worker queue.
      for (const parts of groups) for (const part of parts) assertCurrent(part);
      const results = await Promise.all(
        inputs.map(async (parts) => {
          const result = await runMeshPreparationTask(
            { kind: "surfaces", parts },
            { ...options, signal: controller.signal }
          );
          if (result.kind !== "surfaces")
            throw new Error("Unexpected surface preparation result");
          return result.data;
        })
      );
      if (controller.signal.aborted || pendingRoots.get(root) !== entry)
        throw abortError();
      // Validate the entire preparation before committing any scene attribute.
      for (let group = 0; group < groups.length; group++) {
        const parts = groups[group];
        if (results[group].parts.length !== parts.length)
          throw new Error("Invalid surface preparation parts");
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const output = results[group].parts[i];
          assertCurrent(p);
          if (
            output.indices.length !== p.index.count ||
            output.normals.length !== p.position.count * 3
          )
            throw new Error("Invalid surface preparation attributes");
        }
      }
      for (let group = 0; group < groups.length; group++) {
        const result = results[group];
        groups[group].forEach((part, i) => {
          part.index.array.set(result.parts[i].indices);
          part.index.needsUpdate = true;
          part.geometry.setAttribute(
            "normal",
            new THREE.BufferAttribute(result.parts[i].normals, 3)
          );
          for (const material of part.materials) {
            if (isSeparatedBuildingSurface(material))
              runtimeState.separatedSurfaceRenderSides.set(
                material,
                result.closed ? THREE.FrontSide : THREE.DoubleSide
              );
          }
          runtimeState.normalizedSeparatedSurfaceGeometries.add(part.geometry);
        });
      }
    })()
      .catch((error: unknown) => {
        // Failed groups must not leave their siblings consuming worker capacity.
        controller.abort();
        throw error;
      })
      .finally(() => {
        options.signal?.removeEventListener("abort", abort);
        for (const [geometry, listener] of disposeListeners)
          geometry.removeEventListener("dispose", listener);
        if (pendingRoots.get(root) === entry) pendingRoots.delete(root);
      });
    return entry.promise;
  };
  return {
    isSeparatedBuildingSurface,
    isRenderedBuildingSurface,
    resolveRenderSide,
    asMaterialArray,
    normalizeSeparatedBuildingSurfaces,
  };
}
