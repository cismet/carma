import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

export type ProjectedTerrainTileBounds = Readonly<{
  west: number;
  south: number;
  east: number;
  north: number;
}>;

export type ProjectedTerrainTileSource = Readonly<{
  bounds: ProjectedTerrainTileBounds;
  u: ArrayLike<number>;
  v: ArrayLike<number>;
  heightMeters: ArrayLike<number>;
  indices: ArrayLike<number>;
}>;

export type TerrainTileProjector = (
  longitudeDegrees: number,
  latitudeDegrees: number,
  heightMeters: number,
  target: Vector3
) => Vector3;

export type ProjectedTerrainTileGeometryOptions = Readonly<{
  tile: ProjectedTerrainTileSource;
  projectToWorld: TerrainTileProjector;
}>;

const assertTile = ({ tile }: ProjectedTerrainTileGeometryOptions) => {
  const vertexCount = tile.u.length;
  if (
    vertexCount === 0 ||
    tile.v.length !== vertexCount ||
    tile.heightMeters.length !== vertexCount
  ) {
    throw new RangeError("Terrain tile vertex arrays have different sizes");
  }
  if (tile.indices.length % 3 !== 0) {
    throw new RangeError("Terrain tile indices must describe triangles");
  }
};

/** Projects one native quantized-mesh TIN tile without synthetic skirts. */
export const createProjectedTerrainTileGeometry = (
  options: ProjectedTerrainTileGeometryOptions
): BufferGeometry => {
  assertTile(options);
  const { tile, projectToWorld } = options;
  const positions = new Float32Array(tile.u.length * 3);
  const projected = new Vector3();

  const projectVertex = (sourceIndex: number) => {
    const longitude =
      tile.bounds.west +
      tile.u[sourceIndex] * (tile.bounds.east - tile.bounds.west);
    const latitude =
      tile.bounds.south +
      tile.v[sourceIndex] * (tile.bounds.north - tile.bounds.south);
    projectToWorld(
      longitude,
      latitude,
      tile.heightMeters[sourceIndex],
      projected
    );
    positions[sourceIndex * 3] = projected.x;
    positions[sourceIndex * 3 + 1] = projected.y;
    positions[sourceIndex * 3 + 2] = projected.z;
  };

  for (let index = 0; index < tile.u.length; index += 1) {
    projectVertex(index);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(Array.from(tile.indices));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};
