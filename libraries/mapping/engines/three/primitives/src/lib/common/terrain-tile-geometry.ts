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
  if (
    ![
      tile.bounds.west,
      tile.bounds.south,
      tile.bounds.east,
      tile.bounds.north,
    ].every(Number.isFinite) ||
    tile.bounds.west >= tile.bounds.east ||
    tile.bounds.south >= tile.bounds.north
  ) {
    throw new RangeError("Terrain tile bounds are invalid");
  }
  for (let index = 0; index < vertexCount; index += 1) {
    if (
      !Number.isFinite(tile.u[index]) ||
      !Number.isFinite(tile.v[index]) ||
      !Number.isFinite(tile.heightMeters[index])
    ) {
      throw new TypeError("Terrain tile vertices must be finite");
    }
  }
  for (const index of Array.from(tile.indices)) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError("Terrain tile index is outside the vertex array");
    }
  }
};

const MIN_HORIZONTAL_DOUBLE_AREA_SQUARE_METERS = 1e-10;

const buildUpwardTriangleIndices = (
  positions: Float32Array,
  sourceIndices: ArrayLike<number>
) => {
  const indices: number[] = [];
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    const a = sourceIndices[offset];
    const b = sourceIndices[offset + 1];
    const c = sourceIndices[offset + 2];
    const ax = positions[a * 3];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const bz = positions[b * 3 + 2];
    const cx = positions[c * 3];
    const cz = positions[c * 3 + 2];
    const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (Math.abs(normalY) <= MIN_HORIZONTAL_DOUBLE_AREA_SQUARE_METERS) {
      continue;
    }
    if (normalY > 0) {
      indices.push(a, b, c);
    } else {
      indices.push(a, c, b);
    }
  }
  if (indices.length === 0) {
    throw new RangeError("Terrain tile does not contain a renderable triangle");
  }
  return indices;
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
    if (![projected.x, projected.y, projected.z].every(Number.isFinite)) {
      throw new TypeError("Terrain projector returned a non-finite vertex");
    }
    positions[sourceIndex * 3] = projected.x;
    positions[sourceIndex * 3 + 1] = projected.y;
    positions[sourceIndex * 3 + 2] = projected.z;
  };

  for (let index = 0; index < tile.u.length; index += 1) {
    projectVertex(index);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(buildUpwardTriangleIndices(positions, tile.indices));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};
