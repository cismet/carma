export type MeshPrimitive = {
  positions: number[];
  indices: number[];
  name?: string;
};

const sqrt2 = Math.sqrt(2);
const sqrt6 = Math.sqrt(6);

export const Tetrahedron: MeshPrimitive = {
  name: "Downward Pointing Tetraeder inscribed in Unit Sphere",
  // prettier-ignore
  // Y is up
  // Positions (x, y, z)m
  positions: [
    // Vertex V₀
    0.0, -1.0, 0.0,
    // Vertex V₁
    (2 * sqrt2) / 3,
    1.0 / 3.0,
    0.0,
    // Vertex V₂
    -sqrt2 / 3.0,
    1.0 / 3.0,
    sqrt6 / 3.0,
    // Vertex V₃
    -sqrt2 / 3.0,
    1.0 / 3.0,
    -sqrt6 / 3.0,
  ],
  // Indices for the faces (triangles)
  // prettier-ignore
  indices : [
    2,1,0,
    0,3,2,
    1,3,0,
    2,3,1

    
  ],
};

export const Pyramid: MeshPrimitive = {
  name: "Downwards Pyramid",
  positions: [
    0, 0, 0,          // Vertex 0 (apex)
    1, 2, 1,          // Vertex 1
    1, 2, -1,         // Vertex 2
    -1, 2, -1,        // Vertex 3
    -1, 2, 1,         // Vertex 4
  ],
  indices: [
    // Base face
    1, 2, 3,          // Triangle 1 of the base
    1, 3, 4,          // Triangle 2 of the base

    // Side faces
    0, 1, 2,          // Side face 1
    0, 2, 3,          // Side face 2
    0, 3, 4,          // Side face 3
    0, 4, 1,          // Side face 4
  ],
};
