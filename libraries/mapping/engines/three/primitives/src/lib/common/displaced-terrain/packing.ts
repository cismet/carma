import { BufferAttribute, BufferGeometry } from "three";

export type TerrainTextureLayout = Readonly<{
  width: number;
  height: number;
  floatsPerLayer: number;
  vertexCount: number;
}>;

/** Six Float32 components preserve the prepared RTC positions and normals. */
export const terrainTextureLayout = (
  vertexCount: number,
  maxTextureSize = 4096
): TerrainTextureLayout | undefined => {
  if (
    !Number.isInteger(vertexCount) ||
    vertexCount < 1 ||
    !Number.isInteger(maxTextureSize) ||
    maxTextureSize < 1
  ) {
    return undefined;
  }
  const texels = Math.ceil((vertexCount * 6) / 4);
  const width = Math.min(
    maxTextureSize,
    2 ** Math.ceil(Math.log2(Math.sqrt(texels)))
  );
  const height = Math.ceil(texels / width);
  if (height > maxTextureSize) return undefined;
  return { width, height, floatsPerLayer: width * height * 4, vertexCount };
};

export const packTerrainVertices = (
  geometry: BufferGeometry,
  target: Float32Array,
  layout: TerrainTextureLayout,
  layer = 0
): void => {
  const positions = geometry.getAttribute("position") as BufferAttribute;
  const normals = geometry.getAttribute("normal") as BufferAttribute;
  const start = layer * layout.floatsPerLayer;
  if (
    positions.count !== layout.vertexCount ||
    normals.count !== layout.vertexCount ||
    target.length < start + layout.floatsPerLayer
  ) {
    throw new RangeError("Terrain texture layer does not match its geometry");
  }
  // Typed-array copies retain the original Float32 bits, including signed zero.
  const position = new Uint32Array(
    positions.array.buffer,
    positions.array.byteOffset,
    positions.array.length
  );
  const normal = new Uint32Array(
    normals.array.buffer,
    normals.array.byteOffset,
    normals.array.length
  );
  const bits = new Uint32Array(target.buffer, target.byteOffset, target.length);
  for (let vertex = 0; vertex < layout.vertexCount; vertex += 1) {
    const source = vertex * 3;
    const offset = start + vertex * 6;
    bits[offset] = position[source];
    bits[offset + 1] = position[source + 1];
    bits[offset + 2] = position[source + 2];
    bits[offset + 3] = normal[source];
    bits[offset + 4] = normal[source + 1];
    bits[offset + 5] = normal[source + 2];
  }
};

/** CPU mirror of the shader swizzle, useful for representation parity checks. */
export const unpackTerrainVertex = (
  data: Float32Array,
  layout: TerrainTextureLayout,
  vertex: number,
  layer = 0
): Readonly<{ position: Float32Array; normal: Float32Array }> => {
  const offset = layer * layout.floatsPerLayer + vertex * 6;
  return {
    position: data.slice(offset, offset + 3),
    normal: data.slice(offset + 3, offset + 6),
  };
};

export const geometryBufferBytes = (
  geometries: Iterable<BufferGeometry>
): number => {
  const buffers = new Set<ArrayBufferLike>();
  for (const geometry of geometries) {
    if (geometry.index) buffers.add(geometry.index.array.buffer);
    for (const attribute of Object.values(geometry.attributes)) {
      if (attribute instanceof BufferAttribute)
        buffers.add(attribute.array.buffer);
      else buffers.add(attribute.data.array.buffer);
    }
  }
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
};
