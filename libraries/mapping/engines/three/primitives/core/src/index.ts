// Worker-safe entry: visualizers also initialize React view-state providers.
// Reuse the existing geometry implementation without importing that UI graph.
export { createProjectedTerrainTileGeometry } from "../../src/lib/common/terrain-tile-geometry";
export { computeMeshVertexNormals } from "../../src/lib/common/mesh-helpers";
export { prepareMeshVertexNormalsWasm } from "../../src/lib/common/mesh-normals-wasm";
export type {
  ProjectedTerrainTileSource,
  TerrainTileProjector,
} from "../../src/lib/common/terrain-tile-geometry";
