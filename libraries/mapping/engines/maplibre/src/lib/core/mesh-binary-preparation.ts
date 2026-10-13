import { upgradeGltf1Json, type Gltf1Json } from "./gltf1-upgrade";

export type PreparedBinaryTable = {
  buffer: ArrayBuffer;
  jsonByteLength: number;
  binaryByteLength: number;
};
export type PreparedBinaryTile = {
  kind: "b3dm" | "glb";
  json: Record<string, unknown>;
  binary: ArrayBuffer | null;
  featureTable?: PreparedBinaryTable;
  batchTable?: PreparedBinaryTable;
};

const GLB_MAGIC = 0x46546c67;
const B3DM_MAGIC = 0x6d643362;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const decoder = new TextDecoder("utf-8", { fatal: true });
const invalid = (reason: string): never => {
  throw new Error(`Invalid mesh binary: ${reason}`);
};

/** Parse once in the worker; never rebuild a GLB only for GLTFLoader to parse again. */
export function prepareMeshBinary(buffer: ArrayBuffer): PreparedBinaryTile {
  if (buffer.byteLength < 12) invalid("truncated header");
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  let offset = 0;
  let featureTable: PreparedBinaryTable | undefined;
  let batchTable: PreparedBinaryTable | undefined;
  if (magic === B3DM_MAGIC) {
    if (buffer.byteLength < 28 || view.getUint32(4, true) !== 1)
      invalid("unsupported b3dm header");
    if (view.getUint32(8, true) !== buffer.byteLength)
      invalid("b3dm byteLength mismatch");
    offset = 28;
    const table = (headerOffset: number): PreparedBinaryTable => {
      const jsonByteLength = view.getUint32(headerOffset, true);
      const binaryByteLength = view.getUint32(headerOffset + 4, true);
      const end = offset + jsonByteLength + binaryByteLength;
      if (end > buffer.byteLength) invalid("table exceeds b3dm");
      const bytes = buffer.slice(offset, end);
      offset = end;
      return { buffer: bytes, jsonByteLength, binaryByteLength };
    };
    featureTable = table(12);
    batchTable = table(20);
  } else if (magic !== GLB_MAGIC) invalid("expected b3dm or GLB");

  const available = buffer.byteLength - offset;
  if (available < 12 || view.getUint32(offset, true) !== GLB_MAGIC)
    invalid("missing GLB header");
  const version = view.getUint32(offset + 4, true);
  const length = view.getUint32(offset + 8, true);
  if (length < 12 || length > available) invalid("GLB byteLength mismatch");
  // b3dm containers may pad their embedded GLB to an eight-byte boundary.
  if (length !== available) {
    const padding = new Uint8Array(buffer, offset + length);
    if (
      magic !== B3DM_MAGIC ||
      padding.length > 7 ||
      padding.some((value) => value !== 0 && value !== 0x20)
    )
      invalid("unexpected trailing GLB bytes");
  }
  const end = offset + length;
  const parseJson = (start: number, count: number): Record<string, unknown> => {
    const json: unknown = JSON.parse(
      decoder.decode(new Uint8Array(buffer, start, count))
    );
    if (!json || typeof json !== "object" || Array.isArray(json))
      invalid("GLB JSON must be an object");
    return json as Record<string, unknown>;
  };
  let json: Record<string, unknown> | undefined;
  let binary: ArrayBuffer | null = null;
  if (version === 1) {
    if (length < 20 || view.getUint32(offset + 16, true) !== 0)
      invalid("unsupported GLB1 content");
    const jsonLength = view.getUint32(offset + 12, true);
    const binaryStart = offset + 20 + jsonLength;
    if (binaryStart > end) invalid("GLB1 JSON exceeds payload");
    json = upgradeGltf1Json(parseJson(offset + 20, jsonLength) as Gltf1Json);
    if (binaryStart < end) binary = buffer.slice(binaryStart, end);
  } else if (version === 2) {
    let cursor = offset + 12;
    let chunkIndex = 0;
    let hasBinary = false;
    while (cursor < end) {
      if (cursor + 8 > end) invalid("truncated GLB2 chunk");
      const size = view.getUint32(cursor, true);
      const type = view.getUint32(cursor + 4, true);
      cursor += 8;
      if (size % 4 !== 0 || cursor + size > end)
        invalid("invalid GLB2 chunk bounds");
      if (chunkIndex === 0 && type !== JSON_CHUNK)
        invalid("JSON must be first");
      if (type === JSON_CHUNK) {
        if (json) invalid("duplicate JSON chunk");
        json = parseJson(cursor, size);
      } else if (type === BIN_CHUNK) {
        if (hasBinary || chunkIndex !== 1) invalid("invalid BIN chunk order");
        hasBinary = true;
        binary = size ? buffer.slice(cursor, cursor + size) : null;
      }
      cursor += size;
      chunkIndex += 1;
    }
  } else invalid(`unsupported GLB version ${version}`);
  if (!json) invalid("missing JSON chunk");
  return {
    kind: magic === B3DM_MAGIC ? "b3dm" : "glb",
    json: json!,
    binary,
    ...(featureTable ? { featureTable, batchTable } : {}),
  };
}
