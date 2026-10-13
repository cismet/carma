import { readFileSync } from "node:fs";
import documentFixture from "../core/__fixtures__/oblique-document.json";
import {
  concatenateAvifBytes as concat,
  embedObliqueAvifDocument,
  parseNativeAvif,
  type StandaloneAvifDocument,
} from "../core/avif-native-convention";

const text = (value: string) => new TextEncoder().encode(value);
const n16 = (value: number) => Uint8Array.of(value >> 8, value & 255);
const n32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};
const box = (type: string, ...parts: Uint8Array[]) => {
  const body = concat(...parts);
  return concat(n32(body.length + 8), text(type), body);
};
const full = (type: string, version: number, ...parts: Uint8Array[]) =>
  box(type, Uint8Array.of(version, 0, 0, 0), ...parts);
type NativePreviewFixtureOptions = {
  width?: number;
  height?: number;
  edgeX?: number;
  edgeY?: number;
  calibrated?: boolean;
  metadataPadding?: number;
};

/** Real native BMFF/grid metadata; tiny tagged payloads require a bitmap test decoder. */
export const nativePreviewFixture = ({
  width = 512,
  height = 384,
  edgeX = width,
  edgeY = height,
  calibrated = true,
  metadataPadding = 0,
}: NativePreviewFixtureOptions = {}) => {
  const cols = Math.ceil(width / edgeX),
    rows = Math.ceil(height / edgeY);
  const cells = cols * rows;
  const seed = Uint8Array.from(
    readFileSync(
      new URL(
        "../core/__fixtures__/native-four-two-cells.avif",
        import.meta.url
      )
    )
  );
  const seedLayout = parseNativeAvif(seed)!;
  const codec = seedLayout.index.cells[0].properties
    .filter((property) => property.type !== "ispe")
    .map((property) => Uint8Array.from(property.bytes));
  const ispe = (w: number, h: number) => full("ispe", 0, n32(w), n32(h));
  const properties = [ispe(width, height), ispe(edgeX, edgeY), ...codec];
  const primary = concat(
    Uint8Array.of(0, 0, rows - 1, cols - 1),
    n16(width),
    n16(height)
  );
  const payload = [
    primary,
    ...[4, 3, 2, 1].flatMap((level) =>
      Array.from({ length: cells }, (_, cell) =>
        Uint8Array.of(cell + 2, level, 41, 42)
      )
    ),
  ];
  const ftyp = Uint8Array.from(seedLayout.index.ftyp);
  const metadata = (dataAt: number) => {
    const locations = Array.from({ length: cells + 1 }, (_, item) => {
      const ranges =
        item === 0
          ? [{ offset: dataAt, length: primary.length }]
          : [0, 1, 2, 3].map((layer) => ({
              offset:
                dataAt + primary.length + layer * cells * 4 + (item - 1) * 4,
              length: 4,
            }));
      const record = concat(
        n16(item + 1),
        n16(0),
        n16(ranges.length),
        ...ranges.map(({ offset, length }) => concat(n32(offset), n32(length)))
      );
      return record;
    });
    return full(
      "meta",
      0,
      full("pitm", 0, n16(1)),
      full("iloc", 0, Uint8Array.of(0x44, 0), n16(cells + 1), ...locations),
      full(
        "iinf",
        0,
        n16(cells + 1),
        ...Array.from({ length: cells + 1 }, (_, item) =>
          full(
            "infe",
            2,
            n16(item + 1),
            n16(0),
            text(item === 0 ? "grid" : "av01"),
            Uint8Array.of(0)
          )
        )
      ),
      box(
        "iprp",
        box("ipco", ...properties),
        full(
          "ipma",
          0,
          n32(cells + 1),
          n16(1),
          Uint8Array.of(1, 1),
          ...Array.from({ length: cells }, (_, cell) =>
            concat(
              n16(cell + 2),
              Uint8Array.of(properties.length - 1),
              Uint8Array.from(properties.slice(1).map((_, i) => i + 2))
            )
          )
        )
      ),
      full(
        "iref",
        0,
        box(
          "dimg",
          n16(1),
          n16(cells),
          ...Array.from({ length: cells }, (_, cell) => n16(cell + 2))
        )
      ),
      ...(metadataPadding ? [box("free", new Uint8Array(metadataPadding))] : [])
    );
  };
  const provisional = metadata(0);
  let bytes = concat(
    ftyp,
    metadata(ftyp.length + provisional.length + 8),
    box("mdat", ...payload)
  );
  if (calibrated) {
    const doc = structuredClone(
      documentFixture
    ) as unknown as StandaloneAvifDocument;
    doc.pixelMapping.calibrationDimensions = [width * 2, height * 2];
    doc.pixelMapping.primaryDimensions = [width, height];
    bytes = embedObliqueAvifDocument(bytes, doc);
  }
  const layout = parseNativeAvif(bytes)!;
  return { bytes, layout };
};
