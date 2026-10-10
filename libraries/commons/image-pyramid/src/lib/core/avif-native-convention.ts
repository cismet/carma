import {
  parseAvifGridIndex,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "./avif-grid-index";

export const OBLIQUE_AVIF_NAMESPACE = "urn:cismet:oblique-avif:1";
export type StandaloneAvifDocument = {
  convention: "cismet.oblique-avif";
  version: 1;
  delivery: { levels: number[]; qualityTargets: number[]; previewLevel: 4 };
  catalogSnapshot: {
    sourceId: string;
    dataset: Record<string, unknown>;
    metadata: Record<string, unknown>;
    recordGeometry?: Record<string, unknown>;
    operationalPose: {
      cameraEcefMeters: number[];
      worldToCameraRows: number[][];
      crs: "EPSG:4978";
      sourceVerticalDatum: string;
    };
  };
  pixelMapping: {
    calibrationDimensions: [number, number];
    primaryDimensions: [number, number];
    levelToSensorAffine: Record<string, number[][]>;
  };
  provenance: Record<string, unknown>;
};
type Box = {
  type: string;
  start: number;
  end: number;
  body: number;
  bytes: Uint8Array;
};
const view = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength);
const uint = (b: Uint8Array, o: number, n: number) => {
  if (o < 0 || o + n > b.length) throw Error("Truncated AVIF metadata");
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[o + i];
  if (!Number.isSafeInteger(v)) throw Error("Unsafe AVIF offset");
  return v;
};
const str = (b: Uint8Array, o: number, n: number) =>
  new TextDecoder().decode(b.subarray(o, o + n));
const encode = (s: string) => new TextEncoder().encode(s);
export const concatenateAvifBytes = (...parts: Uint8Array[]) => {
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    b.set(p, o);
    o += p.length;
  }
  return b;
};
const n16 = (n: number) => Uint8Array.of(n >> 8, n & 255);
const n32 = (n: number) => {
  const b = new Uint8Array(4);
  view(b).setUint32(0, n);
  return b;
};
const box = (type: string, ...parts: Uint8Array[]) => {
  const b = concatenateAvifBytes(...parts);
  return concatenateAvifBytes(n32(b.length + 8), encode(type), b);
};
const full = (type: string, version: number, ...parts: Uint8Array[]) =>
  box(type, Uint8Array.of(version, 0, 0, 0), ...parts);
function boxes(b: Uint8Array, start = 0, end = b.length): Box[] {
  const result: Box[] = [];
  for (let o = start; o + 8 <= end; ) {
    let size = uint(b, o, 4),
      header = 8;
    if (size === 1) {
      if (o + 16 > end) break;
      size = uint(b, o + 8, 8);
      header = 16;
    }
    if (size === 0) size = end - o;
    if (size < header) throw Error("Invalid AVIF box size");
    if (o + size > end) break;
    result.push({
      type: str(b, o + 4, 4),
      start: o,
      end: o + size,
      body: o + header,
      bytes: b.subarray(o, o + size),
    });
    o += size;
  }
  return result;
}
/** Legacy UUID can own tables beyond the prefix, so inspect its header only. */
export const hasIndependentAvifPyramidIndex = (b: Uint8Array): boolean => {
  for (let at = 0; at + 8 <= b.length; ) {
    let size = uint(b, at, 4),
      header = 8;
    if (size === 1) {
      if (at + 16 > b.length) return false;
      size = uint(b, at + 8, 8);
      header = 16;
    }
    if (size < header) return false;
    if (str(b, at + 4, 4) === "uuid" && at + header + 16 <= b.length) {
      const id = Array.from(b.subarray(at + header, at + header + 16), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      if (id === "9264b9097b6840af91dcb95a8d3a1b80") return true;
    }
    at += size;
  }
  return false;
};
/** Inspect property headers even when a large meta box extends beyond the prefix. */
export const hasNativeAvifLayers = (b: Uint8Array): boolean => {
  const find = (start: number, end: number, types: string[]) => {
    for (let at = start; at + 8 <= Math.min(end, b.length); ) {
      let size = uint(b, at, 4),
        header = 8;
      if (size === 1) {
        if (at + 16 > b.length) return undefined;
        size = uint(b, at + 8, 8);
        header = 16;
      }
      if (!Number.isSafeInteger(at + size) || size < header || at + size > end)
        return undefined;
      if (types.includes(str(b, at + 4, 4)))
        return { body: at + header, end: at + size };
      at += size;
    }
    return undefined;
  };
  const meta = find(0, Infinity, ["meta"]);
  if (!meta) return false;
  const iprp = find(meta.body + 4, meta.end, ["iprp"]);
  if (!iprp) return false;
  const ipco = find(iprp.body, iprp.end, ["ipco"]);
  return !!ipco && !!find(ipco.body, ipco.end, ["a1lx", "lsel"]);
};
export const avifMetadataEnd = (b: Uint8Array): number | null => {
  for (let o = 0; o + 8 <= b.length; ) {
    const size = uint(b, o, 4);
    if (size < 8) throw Error("Unsupported AVIF bootstrap box");
    if (str(b, o + 4, 4) === "meta") {
      if (o + size > 1024 * 1024) throw Error("AVIF metadata exceeds one MiB");
      return o + size;
    }
    o += size;
  }
  return null;
};
function locations(b: Uint8Array, location: Box) {
  const version = b[location.body],
    os = b[location.body + 4] >> 4,
    ls = b[location.body + 4] & 15;
  const bs = b[location.body + 5] >> 4,
    ix = version ? b[location.body + 5] & 15 : 0;
  let o = location.body + 6,
    count = uint(b, o, version < 2 ? 2 : 4);
  o += version < 2 ? 2 : 4;
  const items = new Map<number, AvifRange[]>();
  for (let i = 0; i < count; i++) {
    const id = uint(b, o, version < 2 ? 2 : 4);
    o += version < 2 ? 2 : 4;
    if (version === 1 || version === 2) {
      if (uint(b, o, 2) & 15) throw Error("Non-file-local item");
      o += 2;
    }
    if (uint(b, o, 2)) throw Error("External AVIF data reference");
    o += 2;
    const base = uint(b, o, bs);
    o += bs;
    const n = uint(b, o, 2);
    o += 2;
    const ranges: AvifRange[] = [];
    for (let j = 0; j < n; j++) {
      o += ix;
      const offset = base + uint(b, o, os);
      o += os;
      const length = uint(b, o, ls);
      o += ls;
      ranges.push({ offset, length });
    }
    items.set(id, ranges);
  }
  return items;
}
function infos(b: Uint8Array, iinf: Box) {
  return boxes(b, iinf.body + 4 + (b[iinf.body] === 0 ? 2 : 4), iinf.end).map(
    (infe) => {
      const v = b[infe.body];
      if (v !== 2 && v !== 3) throw Error("Unsupported item info version");
      const id = uint(b, infe.body + 4, v === 2 ? 2 : 4),
        typeAt = infe.body + (v === 2 ? 8 : 10);
      const type = str(b, typeAt, 4);
      let at = typeAt + 4;
      while (at < infe.end && b[at]) at++;
      at++;
      let last = at;
      while (last < infe.end && b[last]) last++;
      return {
        id,
        type,
        contentType: type === "mime" ? str(b, at, last - at) : "",
        box: infe,
      };
    }
  );
}
function structure(b: Uint8Array) {
  const top = boxes(b),
    meta = top.find((x) => x.type === "meta"),
    ftyp = top.find((x) => x.type === "ftyp");
  if (!meta || !ftyp) throw Error("Incomplete AVIF metadata");
  const children = boxes(b, meta.body + 4, meta.end),
    find = (type: string) => {
      const x = children.find((c) => c.type === type);
      if (!x) throw Error(`Missing AVIF ${type}`);
      return x;
    };
  return {
    top,
    meta,
    ftyp,
    children,
    find,
    items: locations(b, find("iloc")),
    infos: infos(b, find("iinf")),
  };
}
export type NativeAvifLayout = {
  index: AvifGridIndex;
  levels: Map<number, AvifGridIndex>;
  cols: number;
  rows: number;
  xmpRanges: AvifRange[];
  previewPrefixEnd: number;
  fileBytes: number;
};
export function parseNativeAvif(b: Uint8Array): NativeAvifLayout | null {
  const index = parseAvifGridIndex(b);
  if (
    !index.cells.length ||
    !index.cells.every(
      (c) =>
        c.ranges.length === 4 && c.properties.some((p) => p.type === "a1lx")
    )
  )
    return null;
  const s = structure(b),
    refs = s.children.find((c) => c.type === "iref"),
    described = new Set<number>();
  if (refs)
    for (const ref of boxes(b, refs.body + 4, refs.end)) {
      if (ref.type !== "cdsc") continue;
      const size = b[refs.body] === 0 ? 2 : 4,
        id = uint(b, ref.body, size),
        count = uint(b, ref.body + size, 2);
      for (let n = 0; n < count; n++)
        if (uint(b, ref.body + size + 2 + n * size, size) === index.primaryId)
          described.add(id);
    }
  const xmpRanges = s.infos
    .filter(
      (i) => i.contentType === "application/rdf+xml" && described.has(i.id)
    )
    .flatMap((i) => s.items.get(i.id) ?? []);
  const first = index.cells[0].properties.find((p) => p.type === "ispe");
  if (!first) throw Error("Missing cell extent");
  const edgeX = uint(Uint8Array.from(first.bytes), 12, 4),
    edgeY = uint(Uint8Array.from(first.bytes), 16, 4);
  const cols = Math.ceil(index.dimensions.width / edgeX),
    rows = Math.ceil(index.dimensions.height / edgeY);
  if (cols * rows !== index.cells.length || edgeX % 8 || edgeY % 8)
    throw Error("Unsupported native four-layer grid");
  const levels = new Map<number, AvifGridIndex>();
  for (let level = 1; level <= 4; level++) {
    const divisor = 2 ** (level - 1),
      count = 5 - level;
    const cells: AvifItem[] = index.cells.map((cell) => ({
      ...cell,
      ranges: cell.ranges.slice(0, count),
      properties: cell.properties
        .filter((p) => count === 4 || !["a1lx", "lsel"].includes(p.type))
        .map((p) => {
          if (p.type !== "ispe") return p;
          const bytes = Uint8Array.from(p.bytes);
          view(bytes).setUint32(12, Math.ceil(uint(bytes, 12, 4) / divisor));
          view(bytes).setUint32(16, Math.ceil(uint(bytes, 16, 4) / divisor));
          return { ...p, bytes: Array.from(bytes) };
        }),
    }));
    levels.set(level, {
      ...index,
      dimensions: {
        width: Math.ceil(index.dimensions.width / divisor),
        height: Math.ceil(index.dimensions.height / divisor),
      },
      cells,
    });
  }
  const previewPrefixEnd = Math.max(
    index.metadataBytes,
    ...index.primary.ranges.map((r) => r.offset + r.length),
    ...xmpRanges.map((r) => r.offset + r.length),
    ...index.cells.map((c) => c.ranges[0].offset + c.ranges[0].length)
  );
  const fileBytes = Math.max(
    ...[...s.items.values()].flat().map((r) => r.offset + r.length)
  );
  return { index, levels, cols, rows, xmpRanges, previewPrefixEnd, fileBytes };
}
const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlDecode = (s: string) =>
  s.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
    (_, entity: string) => {
      if (entity.startsWith("#"))
        return String.fromCodePoint(
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1))
        );
      return (
        { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<
          string,
          string
        >
      )[entity];
    }
  );
export function readObliqueAvifDocument(
  b: Uint8Array,
  layout = parseNativeAvif(b)
): StandaloneAvifDocument | null {
  if (!layout) return null;
  for (const range of layout.xmpRanges) {
    if (range.length > 1024 * 1024 || range.offset + range.length > b.length)
      throw Error("Incomplete or oversized oblique XMP");
    const xml = str(b, range.offset, range.length);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error("External XML declarations are not allowed");
    const ns = /xmlns:([\w-]+)\s*=\s*["']urn:cismet:oblique-avif:1["']/.exec(
      xml
    );
    if (!ns) continue;
    const text = new RegExp(
      `<${ns[1]}:Document(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${ns[1]}:Document>`
    ).exec(xml);
    if (!text) throw Error("Missing oblique document");
    const doc = JSON.parse(xmlDecode(text[1])) as StandaloneAvifDocument;
    if (
      doc?.convention !== "cismet.oblique-avif" ||
      doc.version !== 1 ||
      !doc.catalogSnapshot?.metadata ||
      !doc.catalogSnapshot?.dataset ||
      typeof doc.catalogSnapshot.sourceId !== "string" ||
      !doc.catalogSnapshot.operationalPose ||
      doc.delivery?.previewLevel !== 4 ||
      !Array.isArray(doc.pixelMapping?.calibrationDimensions)
    )
      throw Error("Unsupported or incomplete oblique AVIF document");
    return doc;
  }
  return null;
}

/** Metadata assembly: preserves every AV1 payload, no decode/hash/quality pass. */
export function embedObliqueAvifDocument(
  input: Uint8Array,
  document: StandaloneAvifDocument
): Uint8Array {
  const layout = parseNativeAvif(input);
  if (!layout) throw Error("A native four-layer grid is required");
  const s = structure(input),
    primaryId = layout.index.primaryId;
  const oldXmp = s.infos.find((i) => i.contentType === "application/rdf+xml");
  const xmpId = oldXmp?.id ?? Math.max(...s.items.keys()) + 1;
  if (xmpId >= 65536) throw Error("16-bit item ID capacity exhausted");
  const xmp = encode(
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:oblique="${OBLIQUE_AVIF_NAMESPACE}"><oblique:Document>${xmlEscape(
      JSON.stringify(document)
    )}</oblique:Document></rdf:Description></rdf:RDF></x:xmpmeta>`
  );
  if (xmp.length > 1024 * 1024)
    throw Error("Oblique document exceeds metadata budget");
  const payloads = new Map<number, Uint8Array[]>();
  for (const [id, ranges] of s.items)
    payloads.set(
      id,
      ranges.map((r) => {
        if (r.offset + r.length > input.length)
          throw Error("Missing input extent");
        return input.subarray(r.offset, r.offset + r.length);
      })
    );
  payloads.set(xmpId, [xmp]);
  const ids = new Set(layout.index.cells.map((c) => c.id)),
    order: { id: number; n: number; bytes: Uint8Array }[] = [];
  for (const [id, parts] of payloads)
    if (!ids.has(id)) parts.forEach((bytes, n) => order.push({ id, n, bytes }));
  for (let n = 0; n < 4; n++)
    for (const c of layout.index.cells)
      order.push({ id: c.id, n, bytes: payloads.get(c.id)![n] });
  const refs = s.children.find((c) => c.type === "iref"),
    existingRefs = refs
      ? boxes(input, refs.body + 4, refs.end).map((x) => x.bytes)
      : [];
  if (!oldXmp)
    existingRefs.push(box("cdsc", n16(xmpId), n16(1), n16(primaryId)));
  const info = s.infos.map((i) => i.box.bytes);
  if (!oldXmp)
    info.push(
      full(
        "infe",
        2,
        n16(xmpId),
        n16(0),
        encode("mime"),
        encode("XMP\0application/rdf+xml\0\0")
      )
    );
  const iinf = full("iinf", 0, n16(info.length), ...info),
    iref = full("iref", 0, ...existingRefs);
  const positions = new Map<number, number[]>();
  for (const [id, parts] of payloads)
    positions.set(
      id,
      parts.map(() => 0)
    );
  const iloc = () =>
    full(
      "iloc",
      0,
      Uint8Array.of(0x44, 0),
      n16(payloads.size),
      ...[...payloads].map(([id, parts]) =>
        concatenateAvifBytes(
          n16(id),
          n16(0),
          n16(parts.length),
          ...parts.map((p, n) =>
            concatenateAvifBytes(n32(positions.get(id)![n]), n32(p.length))
          )
        )
      )
    );
  const meta = () =>
    full(
      "meta",
      0,
      ...s.children.map((c) =>
        c.type === "iloc"
          ? iloc()
          : c.type === "iinf"
          ? iinf
          : c.type === "iref"
          ? iref
          : c.bytes
      ),
      ...(refs ? [] : [iref])
    );
  let at = s.ftyp.bytes.length + meta().length + 8;
  for (const part of order) {
    positions.get(part.id)![part.n] = at;
    at += part.bytes.length;
  }
  return concatenateAvifBytes(
    s.ftyp.bytes,
    meta(),
    box("mdat", ...order.map((p) => p.bytes))
  );
}
