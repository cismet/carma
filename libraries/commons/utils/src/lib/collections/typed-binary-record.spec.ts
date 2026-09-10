import { describe, expect, it, vi } from "vitest";

import { decodeTypedBinaryRecord, encodeTypedBinaryRecord } from "./typed-binary-record";

const rawBytes = (view: ArrayBufferView) =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
const fixture = (metadata: unknown, data = new Uint8Array(), binaryCount = 0) => {
  const json = new TextEncoder().encode(JSON.stringify(metadata));
  const dataOffset = Math.ceil((32 + json.length) / 8) * 8;
  const header = new ArrayBuffer(32);
  new Uint8Array(header).set(new TextEncoder().encode("CARMATBR"));
  const fields = new DataView(header);
  fields.setUint32(8, 1, true);
  fields.setUint32(12, json.length, true);
  fields.setUint32(16, dataOffset, true);
  fields.setUint32(20, binaryCount, true);
  fields.setUint32(24, dataOffset + data.length, true);
  return new Blob([header, json, new Uint8Array(dataOffset - 32 - json.length), data]);
};
const changedHeader = async (blob: Blob, offset: number, value: number) => {
  const bytes = await blob.arrayBuffer();
  new DataView(bytes).setUint32(offset, value, true);
  return new Blob([bytes]);
};

describe("typed binary record", () => {
  it("preserves plain value trees, null prototypes, finite precision and negative zero", async () => {
    const noPrototype = Object.assign(Object.create(null), { nested: -0 });
    const original = {
      empty: null, flags: [true, false], text: "ü🌍\ud800\u0000",
      values: [0, -0, Number.MIN_VALUE, Number.MAX_VALUE, Math.PI, 1.2345678901234567],
      descriptorLike: ["t", "Float64Array", 0, 8], noPrototype,
    };
    const restored = await decodeTypedBinaryRecord<typeof original>(encodeTypedBinaryRecord(original));
    expect(restored).toEqual(original);
    expect(Object.is(restored.values[1], -0)).toBe(true);
    expect(Object.is(restored.noPrototype.nested, -0)).toBe(true);
    expect(Object.getPrototypeOf(restored.noPrototype)).toBeNull();
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
  });

  const arrays = [
    new Int8Array([-128, -1, 0, 127]), new Uint8Array([0, 1, 128, 255]),
    new Uint8ClampedArray([0, 2, 128, 255]), new Int16Array([-32768, -1, 0, 32767]),
    new Uint16Array([0, 1, 32768, 65535]), new Int32Array([-2147483648, -1, 0, 2147483647]),
    new Uint32Array([0, 1, 2147483648, 4294967295]),
    new Float32Array([-0, -1.25, Infinity, NaN]),
    new Float64Array([-0, Math.PI, Number.MIN_VALUE, Number.MAX_VALUE]),
    new BigInt64Array([BigInt("-9223372036854775808"), BigInt(-1), BigInt(0), BigInt("9223372036854775807")]),
    new BigUint64Array([BigInt(0), BigInt(1), BigInt(2), BigInt("18446744073709551615")]),
  ];
  it.each(arrays.map(value => ({ name: value.constructor.name, value })))(
    "preserves exact $name bytes including nonzero-offset subviews",
    async ({ value }) => {
      const subview = value.subarray(1, 3);
      const blob = encodeTypedBinaryRecord({ full: value, subview });
      const restored = await decodeTypedBinaryRecord<{ full: typeof value; subview: typeof value }>(blob);
      expect(rawBytes(restored.full)).toEqual(rawBytes(value));
      expect(restored.subview.constructor).toBe(value.constructor);
      expect(rawBytes(restored.subview)).toEqual(rawBytes(subview));
      expect(restored.subview.byteLength).toBe(subview.byteLength);
      expect(restored.subview.byteOffset % 8).toBe(0);
      expect(restored.subview.buffer.byteLength).toBe(blob.size);
    }
  );

  it("supports Float16Array only when the host provides the native constructor", async () => {
    const constructor = (globalThis as unknown as {
      Float16Array?: new (buffer: ArrayBuffer, offset: number, length: number) => ArrayBufferView;
    }).Float16Array;
    if (!constructor) {
      await expect(decodeTypedBinaryRecord(fixture(["t", "Float16Array", 0, 2], new Uint8Array(2), 1)))
        .rejects.toThrow("natively unsupported");
      return;
    }
    const bits = new Uint16Array([0, 0x8000, 0x7c00, 0x7e01]);
    const original = new constructor(bits.buffer, 0, bits.length);
    const decoded = await decodeTypedBinaryRecord<ArrayBufferView>(encodeTypedBinaryRecord(original));
    expect(decoded.constructor).toBe(constructor);
    expect(rawBytes(decoded)).toEqual(rawBytes(original));
  });

  it("preserves floating-point payload bits rather than re-encoding numeric values", async () => {
    const bits = new Uint32Array([0x7fa12345, 0xffa00001, 0x80000000, 0x00000001]);
    const floats = new Float32Array(bits.buffer);
    const result = await decodeTypedBinaryRecord<Float32Array>(encodeTypedBinaryRecord(floats));
    expect(rawBytes(result)).toEqual(rawBytes(floats));
  });

  it("decodes all typed parts as aligned views of a single native Blob read", async () => {
    const original = { small: new Uint8Array([7]), wide: new Float64Array([Math.PI]), empty: new Uint16Array() };
    const blob = encodeTypedBinaryRecord(original);
    const read = vi.spyOn(blob, "arrayBuffer");
    const restored = await decodeTypedBinaryRecord<typeof original>(blob);
    expect(read).toHaveBeenCalledOnce();
    expect(restored.small.buffer).toBe(restored.wide.buffer);
    expect(restored.empty.buffer).toBe(restored.small.buffer);
    expect(restored.wide.byteOffset % 8).toBe(0);
    expect(restored.empty.length).toBe(0);
    expect(restored.wide[0]).toBe(Math.PI);
    read.mockRestore();
  });

  it("snapshots direct view bytes in the Blob and restores bare ArrayBuffers with exact size", async () => {
    const bytes = new Uint8Array([99, 1, 2, 3, 88]);
    const bare = new Uint8Array([4, 5, 6]).buffer;
    const blob = encodeTypedBinaryRecord({ view: bytes.subarray(1, 4), bare });
    bytes.fill(0);
    new Uint8Array(bare).fill(0);
    const result = await decodeTypedBinaryRecord<{ view: Uint8Array; bare: ArrayBuffer }>(blob);
    expect(result.view).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.bare).toBeInstanceOf(ArrayBuffer);
    expect(result.bare.byteLength).toBe(3);
    expect(new Uint8Array(result.bare)).toEqual(new Uint8Array([4, 5, 6]));
    expect(result.bare).not.toBe(result.view.buffer);
  });

  it.each([
    undefined, NaN, Infinity, -Infinity, BigInt(1), Symbol("unsupported"),
    new Date(0), new Map(), new Set(), new DataView(new ArrayBuffer(8)),
    /regexp/, () => undefined,
  ])("rejects unsupported values rather than silently changing them (%s)", value => {
    expect(() => encodeTypedBinaryRecord(value)).toThrow();
  });

  it("rejects cycles but permits repeated noncyclic values as independent value-tree branches", async () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => encodeTypedBinaryRecord(cycle)).toThrow("cyclic");
    const array: unknown[] = [];
    array.push(array);
    expect(() => encodeTypedBinaryRecord(array)).toThrow("cyclic");
    const shared = { value: 42 };
    expect(await decodeTypedBinaryRecord(encodeTypedBinaryRecord([shared, shared])))
      .toEqual([{ value: 42 }, { value: 42 }]);
  });

  it("rejects accessors without invoking them, sparse arrays and custom properties", () => {
    const getter = vi.fn(() => 1);
    expect(() => encodeTypedBinaryRecord(Object.defineProperty({}, "value", { get: getter, enumerable: true }))).toThrow("accessor");
    expect(getter).not.toHaveBeenCalled();
    expect(() => encodeTypedBinaryRecord(new Array(2))).toThrow("sparse");
    expect(() => encodeTypedBinaryRecord(Object.assign([1], { extra: true }))).toThrow("extra array");
    expect(() => encodeTypedBinaryRecord({ [Symbol("key")]: 1 })).toThrow("symbol");
    expect(() => encodeTypedBinaryRecord(Object.defineProperty({}, "hidden", { value: 1 }))).toThrow("non-enumerable");
    if (typeof SharedArrayBuffer !== "undefined") {
      expect(() => encodeTypedBinaryRecord(new SharedArrayBuffer(8))).toThrow();
      expect(() => encodeTypedBinaryRecord(new Uint8Array(new SharedArrayBuffer(8)))).toThrow("SharedArrayBuffer");
    }
  });

  it.each(["__proto__", "constructor", "prototype"])("rejects unsafe object key %s on both paths", async key => {
    const object = Object.create(null);
    object[key] = true;
    expect(() => encodeTypedBinaryRecord(object)).toThrow("unsafe");
    await expect(decodeTypedBinaryRecord(fixture(["o", false, [[key, true]]]))).rejects.toThrow("unsafe");
  });

  it("rejects duplicate property descriptors without mutating any prototype", async () => {
    await expect(decodeTypedBinaryRecord(fixture(["o", false, [["a", 1], ["a", 2]]])))
      .rejects.toThrow("duplicate");
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("enforces total byte, metadata, descriptor-count and depth limits", async () => {
    expect(() => encodeTypedBinaryRecord(new Uint8Array(64), { maxBytes: 64 })).toThrow("maxBytes");
    const blob = encodeTypedBinaryRecord(new Uint8Array(64));
    await expect(decodeTypedBinaryRecord(blob, { maxBytes: 64 })).rejects.toThrow("maxBytes");
    expect(() => encodeTypedBinaryRecord("a".repeat(1024 ** 2))).toThrow("metadata");
    expect(() => encodeTypedBinaryRecord(Array.from({ length: 4097 }, () => new Uint8Array()))).toThrow("4096");
    let deep: unknown = null;
    for (let i = 0; i < 130; i++) deep = [deep];
    expect(() => encodeTypedBinaryRecord(deep)).toThrow("depth");
    expect(() => encodeTypedBinaryRecord(null, { maxBytes: NaN })).toThrow("maxBytes");
  });

  it("rejects truncated, wrong-magic, wrong-version and invalid header records", async () => {
    const blob = encodeTypedBinaryRecord(new Uint8Array([1, 2, 3]));
    await expect(decodeTypedBinaryRecord(blob.slice(0, 12))).rejects.toThrow("truncated");
    await expect(decodeTypedBinaryRecord(blob.slice(0, blob.size - 1))).rejects.toThrow("header");
    await expect(decodeTypedBinaryRecord(await changedHeader(blob, 0, 0))).rejects.toThrow("magic");
    await expect(decodeTypedBinaryRecord(await changedHeader(blob, 8, 99))).rejects.toThrow("version");
    for (const [offset, value] of [[12, 1024 ** 2 + 1], [16, 33], [20, 4097], [24, 0], [28, 1]]) {
      await expect(decodeTypedBinaryRecord(await changedHeader(blob, offset, value))).rejects.toThrow("header");
    }
  });

  it.each([
    ["t", "UnknownArray", 0, 8], ["t", "Float64Array", 0, 7],
    ["t", "Uint8Array", -1, 1], ["t", "Uint8Array", 0, -1],
    ["t", "Uint8Array", Number.MAX_SAFE_INTEGER + 1, 1],
    ["t", "Uint8Array", 0, Number.MAX_SAFE_INTEGER + 1],
    ["t", "Uint8Array", 0.5, 1], ["t", "Uint8Array", 1, 1],
    ["b", 0, 9], ["unknown-tag"], { unexpected: "parser object" },
  ].map(metadata => ({ metadata })))("rejects unsafe or unknown descriptors $metadata", async ({ metadata }) => {
    await expect(decodeTypedBinaryRecord(fixture(metadata, new Uint8Array(8), 1))).rejects.toThrow();
  });

  it("rejects overlapping ranges, count mismatches, trailing data and nonzero alignment padding", async () => {
    await expect(decodeTypedBinaryRecord(fixture(["a", [["t", "Uint8Array", 0, 8], ["t", "Uint8Array", 0, 8]]], new Uint8Array(8), 2))).rejects.toThrow("overlapping");
    await expect(decodeTypedBinaryRecord(fixture(["t", "Uint8Array", 0, 8], new Uint8Array(8), 0))).rejects.toThrow("count");
    await expect(decodeTypedBinaryRecord(fixture(null, new Uint8Array(1)))).rejects.toThrow("trailing");
    const padded = new Uint8Array(9);
    padded[1] = 1;
    await expect(decodeTypedBinaryRecord(fixture(["a", [["t", "Uint8Array", 0, 1], ["t", "Uint8Array", 8, 1]]], padded, 2))).rejects.toThrow("padding");
  });

  it("rejects invalid UTF-8 metadata instead of silently replacing bytes", async () => {
    const buffer = await encodeTypedBinaryRecord(null).arrayBuffer();
    new Uint8Array(buffer)[32] = 0xff;
    await expect(decodeTypedBinaryRecord(new Blob([buffer]))).rejects.toThrow("UTF-8");
  });
});
