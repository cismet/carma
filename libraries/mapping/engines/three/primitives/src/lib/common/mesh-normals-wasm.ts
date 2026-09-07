import { MESH_NORMALS_WASM_BYTES } from "./mesh-normals-bytes";

type NormalKernel = {
  memory: WebAssembly.Memory;
  normals: (
    positions: number,
    indices: number,
    normals: number,
    vertexCount: number,
    indexCount: number
  ) => void;
};
const WASM_PAGE_BYTES = 65_536;
const MAX_SCRATCH_BYTES = 128 * 1024 * 1024;
let kernel: NormalKernel | undefined;
let initialization: Promise<boolean> | undefined;

/** Once per worker realm; a restrictive CSP keeps the exact JS fallback. */
export const prepareMeshVertexNormalsWasm = (): Promise<boolean> => {
  initialization ??= (async () => {
    try {
      const { instance } = await WebAssembly.instantiate(
        MESH_NORMALS_WASM_BYTES
      );
      kernel = instance.exports as NormalKernel;
      return true;
    } catch {
      return false;
    }
  })();
  return initialization;
};

/** Synchronous hot path after worker warm-up. Scratch storage is never transferred. */
export const tryComputeMeshVertexNormalsWasm = (
  positions: Float32Array,
  indices: Uint16Array | Uint32Array,
  normals: Float32Array
): boolean => {
  if (!kernel || indices.length % 3 !== 0) return false;
  if (positions.length === 0 || indices.length === 0) {
    normals.fill(0);
    return true;
  }
  const indexOffset = positions.byteLength;
  const normalOffset =
    indexOffset + indices.length * Uint32Array.BYTES_PER_ELEMENT;
  const bytes = normalOffset + normals.byteLength;
  if (bytes > MAX_SCRATCH_BYTES) return false;
  try {
    const missing = bytes - kernel.memory.buffer.byteLength;
    if (missing > 0) kernel.memory.grow(Math.ceil(missing / WASM_PAGE_BYTES));
    const buffer = kernel.memory.buffer;
    new Float32Array(buffer, 0, positions.length).set(positions);
    new Uint32Array(buffer, indexOffset, indices.length).set(indices);
    kernel.normals(
      0,
      indexOffset,
      normalOffset,
      positions.length / 3,
      indices.length
    );
    normals.set(new Float32Array(buffer, normalOffset, normals.length));
    return true;
  } catch {
    // Memory pressure / unavailable WASM must not prevent terrain publication.
    kernel = undefined;
    return false;
  }
};
