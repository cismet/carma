import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DataArrayTexture,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  RGBAFormat,
  Sphere,
} from "three";
import { geometryBufferBytes, packTerrainVertices } from "./packing";
import type { TerrainTextureLayout } from "./packing";
import { createTerrainMaterials } from "./shaders";
import type { TerrainSurfaceMaterial } from "./shaders";

type VertexStamp = Readonly<{
  position: BufferAttribute;
  normal: BufferAttribute;
  p: number;
  n: number;
}>;
const stamp = (source: Mesh): VertexStamp => ({
  position: source.geometry.getAttribute("position") as BufferAttribute,
  normal: source.geometry.getAttribute("normal") as BufferAttribute,
  p: (source.geometry.getAttribute("position") as BufferAttribute).version,
  n: (source.geometry.getAttribute("normal") as BufferAttribute).version,
});
const sameStamp = (a: VertexStamp, b: VertexStamp) =>
  a.position === b.position &&
  a.normal === b.normal &&
  a.p === b.p &&
  a.n === b.n;

export const createTerrainBatch = (
  sources: Mesh[],
  layout: TerrainTextureLayout
) => {
  const sourceGeometry = sources[0].geometry;
  const geometry = new BufferGeometry();
  // Built-in shaders require these declarations; values come from gl_VertexID.
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Uint8Array(layout.vertexCount * 3), 3)
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Uint8Array(layout.vertexCount * 3), 3)
  );
  geometry.setIndex(sourceGeometry.index!.clone());
  const uv = sourceGeometry.getAttribute("uv");
  if (uv) geometry.setAttribute("uv", uv.clone());
  geometry.setAttribute(
    "terrainTextureLayer",
    new InstancedBufferAttribute(
      Float32Array.from(sources, (_, index) => index),
      1
    )
  );
  const data = new Float32Array(layout.floatsPerLayer * sources.length);
  const texture = new DataArrayTexture(
    data,
    layout.width,
    layout.height,
    sources.length
  );
  texture.format = RGBAFormat;
  texture.type = FloatType;
  texture.internalFormat = "RGBA32F";
  const materials = createTerrainMaterials(
    sources[0].material as TerrainSurfaceMaterial,
    texture,
    layout
  );
  const mesh = new InstancedMesh(geometry, materials.surface, sources.length);
  mesh.name = "Prepared terrain instances";
  mesh.userData = { ...sources[0].userData, isPreparedTerrainInstance: true };
  mesh.customDepthMaterial = materials.depth;
  mesh.customDistanceMaterial = materials.distance;
  mesh.castShadow = sources[0].castShadow;
  mesh.receiveShadow = sources[0].receiveShadow;
  mesh.renderOrder = sources[0].renderOrder;
  mesh.layers.mask = sources[0].layers.mask;
  mesh.matrixAutoUpdate = false;
  mesh.boundingBox = new Box3();
  mesh.boundingSphere = new Sphere();
  mesh.raycast = (raycaster, intersections) => {
    for (const source of sources) source.raycast(raycaster, intersections);
  };
  const stamps: Array<VertexStamp | undefined> = [];
  const matrix = new Matrix4();
  const previousMatrices = sources.map(() => new Matrix4());
  const box = new Box3();
  const originInverse = new Matrix4();
  const sourceToTarget = new Matrix4();
  let initialized = false;
  let materialVersion = -1;

  const update = (targetInverse: Matrix4): number => {
    let uploadedBytes = 0;
    let matricesChanged = !initialized;
    let verticesChanged = !initialized;
    mesh.boundingBox!.makeEmpty();
    sourceToTarget.multiplyMatrices(targetInverse, sources[0].matrixWorld);
    const [x, y, z] = sourceToTarget.elements.slice(12, 15);
    mesh.matrix.makeTranslation(x, y, z);
    mesh.matrixWorldNeedsUpdate = true;
    originInverse.makeTranslation(-x, -y, -z).multiply(targetInverse);
    sources.forEach((source, layer) => {
      const nextStamp = stamp(source);
      if (!stamps[layer] || !sameStamp(stamps[layer]!, nextStamp)) {
        packTerrainVertices(source.geometry, data, layout, layer);
        texture.addLayerUpdate(layer);
        uploadedBytes += layout.floatsPerLayer * Float32Array.BYTES_PER_ELEMENT;
        if (
          !stamps[layer] ||
          stamps[layer]!.position !== nextStamp.position ||
          stamps[layer]!.p !== nextStamp.p
        ) {
          source.geometry.computeBoundingBox();
        }
        stamps[layer] = nextStamp;
        verticesChanged = true;
      }
      matrix.multiplyMatrices(originInverse, source.matrixWorld);
      if (!initialized || !matrix.equals(previousMatrices[layer])) {
        previousMatrices[layer].copy(matrix);
        mesh.setMatrixAt(layer, matrix);
        matricesChanged = true;
      }
      if (source.geometry.boundingBox)
        mesh.boundingBox!.union(
          box.copy(source.geometry.boundingBox).applyMatrix4(matrix)
        );
    });
    mesh.boundingBox!.getBoundingSphere(mesh.boundingSphere!);
    if (verticesChanged) texture.needsUpdate = true;
    if (matricesChanged) {
      mesh.instanceMatrix.needsUpdate = true;
      uploadedBytes += mesh.instanceMatrix.array.byteLength;
    }
    const sourceMaterial = sources[0].material as TerrainSurfaceMaterial;
    // Renderer integrations compose shader hooks and attach live uniform state.
    const userData = materials.surface.userData;
    const defines = materials.surface.defines;
    materials.surface.copy(sourceMaterial);
    materials.surface.userData = userData;
    materials.surface.defines = { ...sourceMaterial.defines, ...defines };
    const materialChanged = materialVersion !== sourceMaterial.version;
    if (materialChanged) {
      materials.surface.needsUpdate = true;
      materialVersion = sourceMaterial.version;
    }
    // Shadow alpha and clipping settings can change without a material version.
    for (const material of [materials.depth, materials.distance]) {
      material.map = sourceMaterial.map;
      material.alphaMap = sourceMaterial.alphaMap;
      material.alphaTest = sourceMaterial.alphaTest;
      if (material === materials.depth)
        materials.depth.wireframe = sourceMaterial.wireframe;
      material.side = sourceMaterial.side;
      material.clippingPlanes = sourceMaterial.clippingPlanes;
      material.clipIntersection = sourceMaterial.clipIntersection;
      material.clipShadows = sourceMaterial.clipShadows;
      if (materialChanged) material.needsUpdate = true;
    }
    initialized = true;
    return uploadedBytes;
  };

  return {
    mesh,
    sources,
    update,
    /** CPU arrays plus equivalent GPU payload; excludes textures shared with sources. */
    bytes: () =>
      2 *
      (geometryBufferBytes([geometry]) +
        data.byteLength +
        mesh.instanceMatrix.array.byteLength),
    dispose: () => {
      geometry.dispose();
      texture.dispose();
      mesh.dispose();
      materials.surface.dispose();
      materials.depth.dispose();
      materials.distance.dispose();
    },
  };
};
