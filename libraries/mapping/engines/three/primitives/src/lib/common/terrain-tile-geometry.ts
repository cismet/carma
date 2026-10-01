import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { computeMeshVertexNormals } from "./mesh-helpers";

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
  /** Geographic surfaces use source east/north orientation across horizons. */
  triangleOrientation?: "local-up" | "geographic";
  /** Owned output buffer, supplied when the caller prepares normals itself. */
  normalBuffer?: Float32Array;
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
  for (let offset = 0; offset < tile.indices.length; offset += 1) {
    const index = tile.indices[offset];
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError("Terrain tile index is outside the vertex array");
    }
  }
};

const MIN_DOUBLE_AREA_SQUARE_METERS = 1e-10;

const buildTriangleIndices = (
  positions: Float32Array,
  tile: ProjectedTerrainTileSource,
  orientation: "local-up" | "geographic"
) => {
  const sourceIndices = tile.indices;
  const indices =
    positions.length / 3 < 65536
      ? new Uint16Array(sourceIndices.length)
      : new Uint32Array(sourceIndices.length);
  let indexCount = 0;
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
    if (orientation === "geographic") {
      const abx = bx - ax,
        aby = positions[b * 3 + 1] - positions[a * 3 + 1],
        abz = bz - az;
      const acx = cx - ax,
        acy = positions[c * 3 + 1] - positions[a * 3 + 1],
        acz = cz - az;
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      if (
        crossX * crossX + crossY * crossY + crossZ * crossZ <=
        MIN_DOUBLE_AREA_SQUARE_METERS ** 2
      )
        continue;
      const uvArea =
        (tile.u[b] - tile.u[a]) * (tile.v[c] - tile.v[a]) -
        (tile.v[b] - tile.v[a]) * (tile.u[c] - tile.u[a]);
      indices[indexCount] = a;
      indices[indexCount + 1] = uvArea < 0 ? c : b;
      indices[indexCount + 2] = uvArea < 0 ? b : c;
    } else {
      const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (Math.abs(normalY) <= MIN_DOUBLE_AREA_SQUARE_METERS) continue;
      indices[indexCount] = a;
      indices[indexCount + 1] = normalY > 0 ? b : c;
      indices[indexCount + 2] = normalY > 0 ? c : b;
    }
    indexCount += 3;
  }
  if (indexCount === 0) {
    throw new RangeError("Terrain tile does not contain a renderable triangle");
  }
  return indices.subarray(0, indexCount);
};

/** Shared source-position kernel, also used to restore prepared seam inputs
 * without rebuilding their already stored normals, triangles or bounds. */
export const projectTerrainTilePositions = (
  tile: ProjectedTerrainTileSource,
  projectToWorld: TerrainTileProjector
): Float32Array => {
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
    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) ||
      !Number.isFinite(projected.z)
    ) {
      throw new TypeError("Terrain projector returned a non-finite vertex");
    }
    positions[sourceIndex * 3] = projected.x;
    positions[sourceIndex * 3 + 1] = projected.y;
    positions[sourceIndex * 3 + 2] = projected.z;
  };

  for (let index = 0; index < tile.u.length; index += 1) {
    projectVertex(index);
  }
  return positions;
};

/** Projects one geographic terrain triangle mesh without synthetic skirts. */
export const createProjectedTerrainTileGeometry = (
  options: ProjectedTerrainTileGeometryOptions
): BufferGeometry => {
  assertTile(options);
  if (
    options.normalBuffer &&
    options.normalBuffer.length !== options.tile.u.length * 3
  )
    throw new RangeError("Terrain normal buffer has a different vertex count");
  const { tile, projectToWorld, triangleOrientation = "local-up" } = options;
  const positions = projectTerrainTilePositions(tile, projectToWorld);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(
    new BufferAttribute(
      buildTriangleIndices(positions, tile, triangleOrientation),
      1
    )
  );
  if (options.normalBuffer)
    geometry.setAttribute(
      "normal",
      new BufferAttribute(options.normalBuffer, 3)
    );
  else computeMeshVertexNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};
