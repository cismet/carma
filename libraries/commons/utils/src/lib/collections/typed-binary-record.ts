/** Lossless value-tree container, not an object-identity/alias serializer.
 * Plain objects, dense arrays and binary views carry values, not property flags.
 * TypedArray custom properties are outside the binary-view contract. Cycles,
 * accessors, symbols, DataView, SharedArrayBuffer and other native objects reject.
 * Blob construction snapshots direct view bytes; it does not concatenate a
 * second full-size JS payload first. Decode reads one Blob ArrayBuffer, and all
 * TypedArrays view that backing buffer (which also contains other record data).
 * Bare ArrayBuffer values need a slice: JavaScript has no ArrayBuffer subviews.
 */
export type TypedBinaryRecordOptions = Readonly<{ maxBytes?: number }>;

const MAGIC = new Uint8Array([67, 65, 82, 77, 65, 84, 66, 82]); // CARMATBR
const VERSION = 1;
const HEADER_BYTES = 32;
const DEFAULT_MAX_BYTES = 64 * 1024 ** 2;
const MAX_METADATA_BYTES = 1024 ** 2;
const MAX_BINARY_PARTS = 4096;
const MAX_NODES = 65_536;
const MAX_DEPTH = 128;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const TYPE_NAMES = [
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
  "Int32Array", "Uint32Array", "Float16Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array",
] as const;
type ViewConstructor = {
  new (buffer: ArrayBuffer, offset: number, length: number): ArrayBufferView;
  readonly BYTES_PER_ELEMENT: number;
  readonly prototype: object;
};
type Node = null | boolean | string | number | readonly unknown[];
const nativeTypes = new Map<string, ViewConstructor>();
for (const name of TYPE_NAMES) {
  const value = (globalThis as unknown as Record<string, unknown>)[name];
  if (typeof value === "function") nativeTypes.set(name, value as unknown as ViewConstructor);
}
const fail = (reason: string): never => {
  throw new TypeError(`Invalid typed binary record: ${reason}`);
};
const align8 = (value: number) => Math.ceil(value / 8) * 8;
const maximumBytes = (options: TypedBinaryRecordOptions) => {
  const value = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(value) || value < HEADER_BYTES || value > 0xffff_ffff)
    throw new RangeError("Typed binary record maxBytes must be an integer from 32 through 4294967295");
  return value;
};
const validKey = (key: unknown): key is string =>
  typeof key === "string" && !FORBIDDEN_KEYS.has(key);

export const encodeTypedBinaryRecord = (
  value: unknown,
  options: TypedBinaryRecordOptions = {}
): Blob => {
  const limit = maximumBytes(options);
  const parts: BlobPart[] = [];
  const ancestors = new WeakSet<object>();
  let payloadBytes = 0;
  let binaryCount = 0;
  let nodes = 0;
  let stringCharacters = 0;
  const chargeString = (text: string) => {
    stringCharacters += text.length;
    if (stringCharacters > MAX_METADATA_BYTES)
      throw new RangeError("Typed binary record metadata exceeds 1 MiB");
  };
  const binary = (buffer: ArrayBuffer, byteOffset: number, byteLength: number, name?: string): Node => {
    if (++binaryCount > MAX_BINARY_PARTS) throw new RangeError("Typed binary record exceeds 4096 binary parts");
    const offset = align8(payloadBytes);
    if (!Number.isSafeInteger(byteLength) || byteLength < 0 || offset + byteLength > limit)
      throw new RangeError("Typed binary record exceeds maxBytes");
    if (offset !== payloadBytes) parts.push(new Uint8Array(offset - payloadBytes));
    parts.push(new Uint8Array(buffer, byteOffset, byteLength));
    payloadBytes = offset + byteLength;
    return name ? ["t", name, offset, byteLength] : ["b", offset, byteLength];
  };
  const visit = (input: unknown, depth: number): Node => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH)
      throw new RangeError("Typed binary record exceeds node or depth limit");
    if (input === null) return null;
    if (typeof input === "boolean") return input;
    if (typeof input === "string") { chargeString(input); return input; }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) return fail("non-finite primitive number");
      return Object.is(input, -0) ? ["z"] : input;
    }
    if (typeof input !== "object") return fail(`unsupported ${typeof input} value`);
    if (input instanceof ArrayBuffer) return binary(input, 0, input.byteLength);
    if (ArrayBuffer.isView(input)) {
      if (input instanceof DataView) return fail("DataView is unsupported");
      if (!(input.buffer instanceof ArrayBuffer)) return fail("SharedArrayBuffer views are unsupported");
      const found = [...nativeTypes].find(([, constructor]) => Object.getPrototypeOf(input) === constructor.prototype);
      if (!found) return fail("unsupported TypedArray subclass or type");
      return binary(input.buffer, input.byteOffset, input.byteLength, found[0]);
    }
    const prototype = Object.getPrototypeOf(input);
    const array = Array.isArray(input);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      return fail("only plain objects and standard dense arrays are supported");
    if (ancestors.has(input)) return fail("cyclic value tree");
    if (array && input.length > MAX_NODES) throw new RangeError("Typed binary record array exceeds node limit");
    ancestors.add(input);
    try {
      const keys = Reflect.ownKeys(input);
      if (keys.some(key => typeof key !== "string")) return fail("symbol property key");
      if (keys.length > MAX_NODES + (array ? 1 : 0))
        throw new RangeError("Typed binary record object exceeds node limit");
      const descriptors = Object.getOwnPropertyDescriptors(input);
      if (array) {
        if (keys.length !== input.length + 1) return fail("sparse array or extra array property");
        return ["a", Array.from({ length: input.length }, (_, index) => {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
            return fail("sparse array, accessor or non-enumerable array element");
          return visit(descriptor.value, depth + 1);
        })];
      }
      return ["o", prototype === null, keys.map(key => {
        if (!validKey(key)) return fail("unsafe object property key");
        chargeString(key);
        const descriptor = descriptors[key];
        if (!("value" in descriptor) || !descriptor.enumerable)
          return fail("accessor or non-enumerable object property");
        return [key, visit(descriptor.value, depth + 1)];
      })];
    } finally { ancestors.delete(input); }
  };
  const metadata = new TextEncoder().encode(JSON.stringify(visit(value, 0)));
  if (metadata.byteLength > MAX_METADATA_BYTES)
    throw new RangeError("Typed binary record metadata exceeds 1 MiB");
  const dataOffset = align8(HEADER_BYTES + metadata.byteLength);
  const totalBytes = dataOffset + payloadBytes;
  if (totalBytes > limit) throw new RangeError("Typed binary record exceeds maxBytes");
  const header = new ArrayBuffer(HEADER_BYTES);
  new Uint8Array(header).set(MAGIC);
  const fields = new DataView(header);
  fields.setUint32(8, VERSION, true);
  fields.setUint32(12, metadata.byteLength, true);
  fields.setUint32(16, dataOffset, true);
  fields.setUint32(20, binaryCount, true);
  fields.setUint32(24, totalBytes, true);
  return new Blob([
    header, metadata, new Uint8Array(dataOffset - HEADER_BYTES - metadata.byteLength), ...parts,
  ], { type: "application/vnd.carma.typed-binary-record" });
};

/** T is a caller assertion, not schema validation. Validate the decoded domain
 * record before use. TypedArray.byteOffset need not be zero; charge Blob.size,
 * not the sum of decoded view.buffer.byteLength (views share the full container).
 */
export const decodeTypedBinaryRecord = async <T = unknown>(
  blob: Blob,
  options: TypedBinaryRecordOptions = {}
): Promise<T> => {
  const limit = maximumBytes(options);
  if (!(blob instanceof Blob)) return fail("expected native Blob");
  if (blob.size < HEADER_BYTES || blob.size > limit)
    throw new RangeError("Typed binary record is truncated or exceeds maxBytes");
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const fields = new DataView(buffer);
  if (!MAGIC.every((value, index) => bytes[index] === value)) return fail("magic mismatch");
  if (fields.getUint32(8, true) !== VERSION) return fail("unsupported version");
  const metadataBytes = fields.getUint32(12, true);
  const dataOffset = fields.getUint32(16, true);
  const expectedCount = fields.getUint32(20, true);
  if (metadataBytes === 0 || metadataBytes > MAX_METADATA_BYTES ||
    dataOffset !== align8(HEADER_BYTES + metadataBytes) || dataOffset > buffer.byteLength ||
    expectedCount > MAX_BINARY_PARTS || fields.getUint32(24, true) !== buffer.byteLength ||
    fields.getUint32(28, true) !== 0) return fail("invalid header, bounds or count");
  const zeroPadding = (start: number, end: number) => {
    for (let index = start; index < end; index++)
      if (bytes[index] !== 0) return fail("nonzero alignment padding");
  };
  zeroPadding(HEADER_BYTES + metadataBytes, dataOffset);
  let root: unknown;
  try {
    root = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(buffer, HEADER_BYTES, metadataBytes)
    ));
  } catch { return fail("invalid UTF-8 or metadata JSON"); }
  let binaryCount = 0;
  let payloadEnd = 0;
  let nodes = 0;
  const binaryRange = (offset: unknown, length: unknown) => {
    if (typeof offset !== "number" || typeof length !== "number" ||
      !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
      offset !== align8(payloadEnd) || offset > buffer.byteLength - dataOffset ||
      length > buffer.byteLength - dataOffset - offset || ++binaryCount > MAX_BINARY_PARTS)
      return fail("unsafe, overlapping or out-of-bounds binary descriptor");
    zeroPadding(dataOffset + payloadEnd, dataOffset + offset);
    payloadEnd = offset + length;
    return { offset: dataOffset + offset, length };
  };
  const visit = (node: unknown, depth: number): unknown => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return fail("node or depth limit exceeded");
    if (node === null || typeof node === "boolean" || typeof node === "string") return node;
    if (typeof node === "number") return Number.isFinite(node) ? node : fail("non-finite metadata number");
    if (!Array.isArray(node)) return fail("invalid metadata node");
    switch (node[0]) {
      case "z":
        if (node.length !== 1) return fail("invalid negative-zero descriptor");
        return -0;
      case "a":
        if (node.length !== 2 || !Array.isArray(node[1]) || node[1].length > MAX_NODES)
          return fail("invalid array descriptor");
        return node[1].map(child => visit(child, depth + 1));
      case "o": {
        if (node.length !== 3 || typeof node[1] !== "boolean" || !Array.isArray(node[2]) || node[2].length > MAX_NODES)
          return fail("invalid object descriptor");
        const result: Record<string, unknown> = Object.create(node[1] ? null : Object.prototype);
        const keys = new Set<string>();
        for (const pair of node[2]) {
          if (!Array.isArray(pair) || pair.length !== 2 || !validKey(pair[0]) || keys.has(pair[0]))
            return fail("duplicate or unsafe object property key");
          keys.add(pair[0]);
          result[pair[0]] = visit(pair[1], depth + 1);
        }
        return result;
      }
      case "b": {
        if (node.length !== 3) return fail("invalid ArrayBuffer descriptor");
        const range = binaryRange(node[1], node[2]);
        return buffer.slice(range.offset, range.offset + range.length);
      }
      case "t": {
        if (node.length !== 4 || typeof node[1] !== "string") return fail("invalid TypedArray descriptor");
        const constructor = nativeTypes.get(node[1]);
        if (!constructor) return fail("unknown or natively unsupported TypedArray type");
        const range = binaryRange(node[2], node[3]);
        if (range.offset % constructor.BYTES_PER_ELEMENT || range.length % constructor.BYTES_PER_ELEMENT)
          return fail("misaligned TypedArray descriptor");
        return new constructor(buffer, range.offset, range.length / constructor.BYTES_PER_ELEMENT);
      }
      default: return fail("unknown metadata descriptor");
    }
  };
  const result = visit(root, 0);
  if (binaryCount !== expectedCount || dataOffset + payloadEnd !== buffer.byteLength)
    return fail("binary count mismatch or trailing payload");
  return result as T;
};
