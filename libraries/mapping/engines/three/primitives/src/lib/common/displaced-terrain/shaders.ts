import {
  DataArrayTexture,
  Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
} from "three";
import type { TerrainTextureLayout } from "./packing";

export type TerrainSurfaceMaterial =
  | MeshStandardMaterial
  | MeshPhongMaterial
  | MeshLambertMaterial
  | MeshBasicMaterial;

const vertexPulling = `
uniform highp sampler2DArray terrainVertices;
uniform int terrainTextureWidth;
attribute float terrainTextureLayer;
vec4 terrainTexel(int address) {
  return texelFetch(terrainVertices, ivec3(address % terrainTextureWidth,
    address / terrainTextureWidth, int(terrainTextureLayer)), 0);
}
void terrainVertex(out vec3 terrainPosition, out vec3 terrainNormal) {
  int component = gl_VertexID * 6;
  vec4 a = terrainTexel(component / 4);
  vec4 b = terrainTexel(component / 4 + 1);
  if (component % 4 == 0) {
    terrainPosition = a.xyz;
    terrainNormal = vec3(a.w, b.xy);
  } else {
    terrainPosition = vec3(a.zw, b.x);
    terrainNormal = b.yzw;
  }
}
`;

/** The same prepared vertex is used by color, directional and point-light passes. */
export const applyTerrainVertexPulling = (
  shader: {
    vertexShader: string;
    uniforms: Record<string, { value: unknown }>;
  },
  texture: DataArrayTexture,
  layout: TerrainTextureLayout
): void => {
  shader.uniforms.terrainVertices = { value: texture };
  shader.uniforms.terrainTextureWidth = { value: layout.width };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${vertexPulling}`)
    .replace(
      "void main() {",
      "void main() {\nvec3 terrainPreparedPosition;\nvec3 terrainPreparedNormal;\nterrainVertex(terrainPreparedPosition, terrainPreparedNormal);"
    )
    .replace(
      "#include <beginnormal_vertex>",
      `vec3 objectNormal = terrainPreparedNormal;`
    )
    .replace(
      "#include <begin_vertex>",
      `vec3 transformed = terrainPreparedPosition;`
    );
};

export const createTerrainMaterials = (
  source: TerrainSurfaceMaterial,
  texture: DataArrayTexture,
  layout: TerrainTextureLayout
) => {
  const surface = source.clone();
  const alphaOptions = {
    map: source.map,
    alphaMap: source.alphaMap,
    alphaTest: source.alphaTest,
    side: source.side,
    clippingPlanes: source.clippingPlanes,
    clipIntersection: source.clipIntersection,
    clipShadows: source.clipShadows,
  };
  const depth = new MeshDepthMaterial({
    ...alphaOptions,
    wireframe: source.wireframe,
    depthPacking: RGBADepthPacking,
  });
  const distance = new MeshDistanceMaterial(alphaOptions);
  for (const material of [surface, depth, distance]) {
    material.onBeforeCompile = (shader) =>
      applyTerrainVertexPulling(shader, texture, layout);
    material.customProgramCacheKey = () => "prepared-terrain-vertex-pulling";
  }
  return { surface, depth, distance };
};

export const hasDefaultMaterialShader = (material: Material): boolean =>
  material.onBeforeCompile === Material.prototype.onBeforeCompile &&
  material.customProgramCacheKey === Material.prototype.customProgramCacheKey;
