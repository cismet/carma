import { BufferAttribute, type BufferGeometry } from "three";

export type TerrainEdgeSubdivision = {
  a: number;
  b: number;
  /** Ordered from a to b, excluding those endpoints. */
  vertices: Array<{ position: readonly number[]; normal: readonly number[] }>;
};

const edgeKey = (a: number, b: number) => `${Math.min(a, b)}/${Math.max(a, b)}`;

/**
 * Split boundary triangles at the neighbor's vertices. Collinearity alone is
 * not watertight under GPU rasterization: both sides must use the same segments.
 * Interior triangles and heights remain unchanged; no skirts or overlapping faces.
 */
export const refineTerrainBoundaryTriangles = (
  geometry: BufferGeometry,
  subdivisions: readonly TerrainEdgeSubdivision[]
) => {
  if (subdivisions.length === 0) return;
  const sourcePositions = geometry.getAttribute("position").array;
  const sourceNormals = geometry.getAttribute("normal").array;
  const sourceIndices = geometry.index!.array;
  const insertedCount = subdivisions.reduce(
    (sum, edge) => sum + edge.vertices.length,
    0
  );
  // A corner triangle can have two subdivided edges and needs one centroid.
  const positions = new Float32Array(
    sourcePositions.length + (insertedCount + subdivisions.length) * 3
  );
  const normals = new Float32Array(positions.length);
  positions.set(sourcePositions);
  normals.set(sourceNormals);
  let vertexCount = sourcePositions.length / 3;
  const edges = new Map<string, number[]>();
  const boundary = new Uint8Array(sourcePositions.length / 3);
  for (const { a, b, vertices } of subdivisions) {
    boundary[a] = boundary[b] = 1;
    const sequence = [a];
    for (const vertex of vertices) {
      positions.set(vertex.position, vertexCount * 3);
      normals.set(vertex.normal, vertexCount * 3);
      sequence.push(vertexCount++);
    }
    sequence.push(b);
    edges.set(edgeKey(a, b), sequence);
  }
  const indices = new Uint32Array(
    sourceIndices.length + insertedCount * 6 + subdivisions.length * 12
  );
  let indexCount = 0;
  const triangle = (a: number, b: number, c: number) => {
    indices[indexCount++] = a;
    indices[indexCount++] = b;
    indices[indexCount++] = c;
  };
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    const a = sourceIndices[offset],
      b = sourceIndices[offset + 1],
      c = sourceIndices[offset + 2];
    if (boundary[a] + boundary[b] + boundary[c] < 2) {
      triangle(a, b, c);
      continue;
    }
    const corners = [a, b, c];
    const sequences = corners.map((a, i) => {
      const sequence = edges.get(edgeKey(a, corners[(i + 1) % 3]));
      return (
        sequence && (sequence[0] === a ? sequence : [...sequence].reverse())
      );
    });
    const splitSides = sequences.filter(Boolean).length;
    if (splitSides === 0) {
      triangle(corners[0], corners[1], corners[2]);
    } else if (splitSides === 1) {
      const side = sequences.findIndex(Boolean);
      const sequence = sequences[side]!;
      for (let i = 0; i < sequence.length - 1; i++) {
        triangle(sequence[i], sequence[i + 1], corners[(side + 2) % 3]);
      }
    } else {
      const center = vertexCount++;
      for (let axis = 0; axis < 3; axis++) {
        positions[center * 3 + axis] =
          corners.reduce((sum, i) => sum + positions[i * 3 + axis], 0) / 3;
        normals[center * 3 + axis] =
          corners.reduce((sum, i) => sum + normals[i * 3 + axis], 0) / 3;
      }
      const perimeter = corners.flatMap(
        (a, i) => sequences[i]?.slice(0, -1) ?? [a]
      );
      for (let i = 0; i < perimeter.length; i++) {
        triangle(center, perimeter[i], perimeter[(i + 1) % perimeter.length]);
      }
    }
  }
  geometry.setAttribute(
    "position",
    new BufferAttribute(positions.subarray(0, vertexCount * 3), 3)
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(normals.subarray(0, vertexCount * 3), 3)
  );
  geometry.setIndex(new BufferAttribute(indices.subarray(0, indexCount), 1));
};
