import { ModelAsset } from "@carma-mapping/cesium-engine/types";
import { MeshPrimitive, Pyramid, Tetrahedron } from "./primitives";

type BufferView = {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  target?: number;
};

type Accessor = {
  bufferView: number;
  byteOffset?: number;
  componentType: number; // The data type of the components (e.g., FLOAT, UNSIGNED_SHORT)
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4";
  min?: number[];
  max?: number[];
};
// gltfGenerator.ts

export function computeNormals(
  positions: number[],
  indices: number[],
): number[] {
  const normals = new Array(positions.length).fill(0);

  for (let i = 0; i < indices.length; i += 3) {
    const idx0 = indices[i] * 3;
    const idx1 = indices[i + 1] * 3;
    const idx2 = indices[i + 2] * 3;

    const v0 = positions.slice(idx0, idx0 + 3);
    const v1 = positions.slice(idx1, idx1 + 3);
    const v2 = positions.slice(idx2, idx2 + 3);

    const edge1 = v1.map((v, idx) => v - v0[idx]);
    const edge2 = v2.map((v, idx) => v - v0[idx]);

    // Compute the cross product
    const normal = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0],
    ];

    const length = Math.hypot(...normal);
    normal.forEach((n, idx) => (normal[idx] = n / length));

    // Add the normal to each vertex of the face
    [idx0, idx1, idx2].forEach((idx) => {
      normals[idx] += normal[0];
      normals[idx + 1] += normal[1];
      normals[idx + 2] += normal[2];
    });
  }

  // Normalize the normals
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }

  return normals;
}

export function generateModelAsset({
  primitive = Pyramid,
  color = [0.5, 0.5, 0.5, 1.0],
  ...modelOptions
}: {
  primitive?: MeshPrimitive;
  color?: number[];
} & Partial<ModelAsset> = {}): ModelAsset {
  const {positions, indices} = primitive;
  const normals = computeNormals(positions, indices);

  // Create GLTF model


  console.info("[GLTF] generating model", primitive.name, color, modelOptions);
  const { gltf, buffer } = createGLTFModel(positions, normals, indices, color);

  // Encode buffer to base64
  const bufferBase64 = arrayBufferToBase64(buffer);

  // Update GLTF buffer URI to include the base64 data
  gltf.buffers[0].uri = `data:application/octet-stream;base64,${bufferBase64}`;

  // Serialize the GLTF JSON
  const gltfJson = JSON.stringify(gltf);

  // Create a Blob URL for the GLTF JSON
  const gltfBlob = new Blob([gltfJson], { type: "model/gltf+json" });
  const gltfUrl = URL.createObjectURL(gltfBlob);

  // Return the ModelAsset
  const modelAsset: ModelAsset = {
    uri: gltfUrl,
    ...modelOptions,
  };

  return modelAsset;
}

// Helper function to convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Function to create GLTF model
function createGLTFModel(
  positions: number[],
  normals: number[],
  indices: number[],
  color: number[],
): { gltf: any; buffer: ArrayBuffer } {
  const positionBuffer = new Float32Array(positions);
  const normalBuffer = new Float32Array(normals);
  const indexBuffer = new Uint16Array(indices);

  // Concatenate buffers
  const buffers = [
    positionBuffer.buffer,
    normalBuffer.buffer,
    indexBuffer.buffer,
  ];
  const totalBufferLength = buffers.reduce(
    (sum, buffer) => sum + buffer.byteLength,
    0,
  );
  const combinedBuffer = new ArrayBuffer(totalBufferLength);
  const combinedView = new Uint8Array(combinedBuffer);

  let offset = 0;
  buffers.forEach((buffer) => {
    combinedView.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  });

  // Define bufferViews and accessors
  const bufferViews: BufferView[] = [];
  const accessors: Accessor[] = [];
  offset = 0;

  // Positions
  bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: positionBuffer.byteLength,
    target: 34962, // ARRAY_BUFFER
  });
  accessors.push({
    bufferView: 0,
    componentType: 5126, // FLOAT
    count: positions.length / 3,
    type: "VEC3",
    min: [
      Math.min(...positions.filter((_, i) => i % 3 === 0)),
      Math.min(...positions.filter((_, i) => i % 3 === 1)),
      Math.min(...positions.filter((_, i) => i % 3 === 2)),
    ],
    max: [
      Math.max(...positions.filter((_, i) => i % 3 === 0)),
      Math.max(...positions.filter((_, i) => i % 3 === 1)),
      Math.max(...positions.filter((_, i) => i % 3 === 2)),
    ],
  });
  offset += positionBuffer.byteLength;

  // Normals
  bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: normalBuffer.byteLength,
    target: 34962,
  });
  accessors.push({
    bufferView: 1,
    componentType: 5126,
    count: normals.length / 3,
    type: "VEC3",
  });
  offset += normalBuffer.byteLength;

  // Indices
  bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: indexBuffer.byteLength,
    target: 34963, // ELEMENT_ARRAY_BUFFER
  });
  accessors.push({
    bufferView: 2,
    componentType: 5123, // UNSIGNED_SHORT
    count: indices.length,
    type: "SCALAR",
  });

  // Material with configurable color and metallic properties
  const material = {
    pbrMetallicRoughness: {
      baseColorFactor: color,
      metallicFactor: 0.0, // Fully metallic
      roughnessFactor: 1.0, // Fully reflective
    },
  };

  // Assemble the GLTF JSON
  const gltf = {
    asset: { version: "2.0" },
    buffers: [
      {
        byteLength: combinedBuffer.byteLength,
      },
    ],
    bufferViews: bufferViews,
    accessors: accessors,
    materials: [material],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
            material: 0,
            mode: 4, // TRIANGLES
          },
        ],
      },
    ],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };

  return { gltf, buffer: combinedBuffer };
}
