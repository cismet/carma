/** File-local opaque libavif grid index. */
export type AvifRange = { offset: number; length: number };
export type AvifProperty = {
  type: string;
  essential: boolean;
  bytes: number[];
};
export type AvifItem = {
  id: number;
  ranges: AvifRange[];
  properties: AvifProperty[];
};
export type AvifGridIndex = {
  ftyp: number[];
  metadataBytes: number;
  primaryId: number;
  dimensions: { width: number; height: number };
  primary: AvifItem;
  cells: AvifItem[];
};
type AvifBox = {
  type: string;
  start: number;
  end: number;
  body: number;
  bytes: Uint8Array;
};
const ascii = (bytes: Uint8Array, a: number, b: number) =>
  String.fromCharCode(...bytes.subarray(a, b));
const u16 = (bytes: Uint8Array, o: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint16(o);
const u32 = (bytes: Uint8Array, o: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint32(o);
const uint = (bytes: Uint8Array, o: number, n: number) => {
  let value = 0;
  for (let i = 0; i < n; i++) value = value * 256 + bytes[o + i];
  if (!Number.isSafeInteger(value)) throw new Error("Unsafe64-bit offset");
  return value;
};
const cat = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    bytes.set(p, o);
    o += p.length;
  }
  return bytes;
};
const text = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const n16 = (n: number) => Uint8Array.of(n >> 8, n & 255);
const n32 = (n: number) =>
  Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const box = (type: string, ...parts: Uint8Array[]) => {
  const body = cat(...parts);
  return cat(n32(body.length + 8), text(type), body);
};
const full = (
  type: string,
  version: number,
  flags: number,
  ...parts: Uint8Array[]
) =>
  box(
    type,
    Uint8Array.of(
      version,
      (flags >>> 16) & 255,
      (flags >>> 8) & 255,
      flags & 255
    ),
    ...parts
  );
function boxes(bytes: Uint8Array, start: number, end: number): AvifBox[] {
  const result: AvifBox[] = [];
  for (let o = start; o + 8 <= end; ) {
    const size = u32(bytes, o),
      type = ascii(bytes, o + 4, o + 8);
    if (size < 8 || o + size > end) break;
    result.push({
      type,
      start: o,
      end: o + size,
      body: o + 8,
      bytes: bytes.slice(o, o + size),
    });
    o += size;
  }
  return result;
}
export function parseAvifGridIndex(bytes: Uint8Array): AvifGridIndex {
  const top = boxes(bytes, 0, bytes.length),
    meta = top.find((b) => b.type === "meta"),
    ftyp = top.find((b) => b.type === "ftyp");
  if (!meta || !ftyp) throw new Error("Complete ftyp/meta not in header");
  const children = boxes(bytes, meta.body + 4, meta.end),
    find = (type: string) => {
      const b = children.find((b) => b.type === type);
      if (!b) throw new Error(`Missing${type}`);
      return b;
    };
  const primaryBox = find("pitm"),
    primaryId =
      bytes[primaryBox.body] === 0
        ? u16(bytes, primaryBox.body + 4)
        : u32(bytes, primaryBox.body + 4);
  const location = find("iloc"),
    version = bytes[location.body],
    offsetSize = bytes[location.body + 4] >> 4,
    lengthSize = bytes[location.body + 4] & 15,
    baseSize = bytes[location.body + 5] >> 4,
    indexSize = version ? bytes[location.body + 5] & 15 : 0;
  let o = location.body + 6,
    count = version < 2 ? u16(bytes, o) : u32(bytes, o);
  o += version < 2 ? 2 : 4;
  const items = new Map<number, AvifItem>();
  for (let i = 0; i < count; i++) {
    const id = version < 2 ? u16(bytes, o) : u32(bytes, o);
    o += version < 2 ? 2 : 4;
    let method = 0;
    if (version === 1 || version === 2) {
      method = u16(bytes, o) & 15;
      o += 2;
    }
    const ref = u16(bytes, o);
    o += 2;
    const base = uint(bytes, o, baseSize);
    o += baseSize;
    const extents = u16(bytes, o);
    o += 2;
    if (method !== 0 || ref !== 0)
      throw new Error("Non-file-local extent unsupported");
    const ranges: AvifRange[] = [];
    for (let j = 0; j < extents; j++) {
      o += indexSize;
      const offset = base + uint(bytes, o, offsetSize);
      o += offsetSize;
      const length = uint(bytes, o, lengthSize);
      o += lengthSize;
      ranges.push({ offset, length });
    }
    items.set(id, { id, ranges, properties: [] });
  }
  const iprp = find("iprp"),
    propertyBoxes = boxes(bytes, iprp.body, iprp.end),
    ipco = propertyBoxes.find((b) => b.type === "ipco"),
    ipma = propertyBoxes.find((b) => b.type === "ipma");
  if (!ipco || !ipma) throw new Error("Missing properties");
  const properties = boxes(bytes, ipco.body, ipco.end);
  o = ipma.body;
  const propVersion = bytes[o],
    flags = uint(bytes, o + 1, 3);
  o += 4;
  count = u32(bytes, o);
  o += 4;
  for (let i = 0; i < count; i++) {
    const id = propVersion < 1 ? u16(bytes, o) : u32(bytes, o);
    o += propVersion < 1 ? 2 : 4;
    const associations = bytes[o++];
    for (let j = 0; j < associations; j++) {
      const raw = flags & 1 ? u16(bytes, o) : bytes[o];
      o += flags & 1 ? 2 : 1;
      const index = raw & (flags & 1 ? 0x7fff : 0x7f);
      if (index && items.has(id)) {
        const p = properties[index - 1];
        if (!p) throw Error("Missing associated property");
        items.get(id)!.properties.push({
          type: p.type,
          essential: !!(raw & (flags & 1 ? 0x8000 : 0x80)),
          bytes: Array.from(p.bytes),
        });
      }
    }
  }
  const iref = children.find((b) => b.type === "iref");
  let cells: AvifItem[] = [];
  if (iref) {
    const refs = boxes(bytes, iref.body + 4, iref.end),
      dimg = refs.find(
        (b) => b.type === "dimg" && u16(bytes, b.body) === primaryId
      );
    if (dimg) {
      const n = u16(bytes, dimg.body + 2);
      for (let j = 0; j < n; j++) {
        const cell = items.get(u16(bytes, dimg.body + 4 + j * 2));
        if (!cell) throw Error("Missing grid item");
        cells.push(cell);
      }
    }
  }
  const primary = items.get(primaryId);
  if (!primary) throw Error("Missing primary item");
  const ispe = primary.properties.find((p) => p.type === "ispe");
  if (!ispe) throw Error("Missing image dimensions");
  const dimensions = {
    width: u32(Uint8Array.from(ispe.bytes), 12),
    height: u32(Uint8Array.from(ispe.bytes), 16),
  };
  return {
    ftyp: Array.from(ftyp.bytes),
    metadataBytes: meta.end,
    primaryId,
    dimensions,
    primary,
    cells,
  };
}
export function makeAvifTileHeader(
  index: AvifGridIndex,
  cell: AvifItem,
  payloadBytes: number
): Uint8Array {
  if (cell.properties.some((p) => p.type === "auxC"))
    throw new Error("Alpha not supported in proof");
  const props = cell.properties.filter((p) =>
    [
      "ispe",
      "pixi",
      "av1C",
      "colr",
      "a1lx",
      "lsel",
      "clli",
      "mdcv",
      "pasp",
    ].includes(p.type)
  );
  const hdlr = full(
    "hdlr",
    0,
    0,
    n32(0),
    text("pict"),
    new Uint8Array(12),
    Uint8Array.of(0)
  );
  const pitm = full("pitm", 0, 0, n16(1));
  const infe = full(
    "infe",
    2,
    0,
    n16(1),
    n16(0),
    text("av01"),
    Uint8Array.of(0)
  );
  const iinf = full("iinf", 0, 0, n16(1), infe);
  const ipco = box("ipco", ...props.map((p) => Uint8Array.from(p.bytes)));
  const ipma = full(
    "ipma",
    0,
    0,
    n32(1),
    n16(1),
    Uint8Array.of(props.length),
    Uint8Array.from(props.map((p, i) => (p.essential ? 128 : 0) | (i + 1)))
  );
  const iprp = box("iprp", ipco, ipma),
    ftyp = Uint8Array.from(index.ftyp);
  const iloc = (offset: number) =>
    full(
      "iloc",
      0,
      0,
      Uint8Array.of(0x44, 0),
      n16(1),
      n16(1),
      n16(0),
      n16(1),
      n32(offset),
      n32(payloadBytes)
    );
  let meta = full("meta", 0, 0, hdlr, pitm, iloc(0), iinf, iprp);
  meta = full(
    "meta",
    0,
    0,
    hdlr,
    pitm,
    iloc(ftyp.length + meta.length + 8),
    iinf,
    iprp
  );
  return cat(ftyp, meta, n32(payloadBytes + 8), text("mdat"));
}

export function makeAvifTile(
  index: AvifGridIndex,
  cell: AvifItem,
  payload: Uint8Array
): Uint8Array {
  return cat(makeAvifTileHeader(index, cell, payload.byteLength), payload);
}
