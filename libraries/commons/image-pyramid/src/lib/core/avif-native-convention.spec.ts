import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import documentFixture from "./__fixtures__/oblique-document.json";
import {
  embedObliqueAvifDocument,
  parseNativeAvif,
  readObliqueAvifDocument,
  type StandaloneAvifDocument,
} from "./avif-native-convention";

// Synthetic RGB ramps, checkerboard, diagonals and circles; no photographic input.
// libavif 1.4.2/AOM 3.14.1: 10-bit 4:4:4, two 512px cells, four spatial layers.
const nativeFixture = () =>
  Uint8Array.from(
    readFileSync(
      new URL("./__fixtures__/native-four-two-cells.avif", import.meta.url)
    )
  );
const document = () =>
  structuredClone(documentFixture) as unknown as StandaloneAvifDocument;
const ispeSize = (bytes: number[]) => {
  const data = Uint8Array.from(bytes);
  const view = new DataView(data.buffer);
  return [view.getUint32(12), view.getUint32(16)];
};

describe("native AVIF metadata assembly", () => {
  it("preserves every real AV1 extent and the calibrated camera document", () => {
    const input = nativeFixture(),
      inputCopy = input.slice(),
      before = parseNativeAvif(input)!;
    const metadata = document(),
      output = embedObliqueAvifDocument(input, metadata),
      after = parseNativeAvif(output)!;
    expect(after.index.dimensions).toEqual({ width: 1024, height: 512 });
    expect([after.cols, after.rows]).toEqual([2, 1]);
    expect(after.index.cells).toHaveLength(2);
    before.index.cells.forEach((cell, n) => {
      expect(after.index.cells[n].properties).toEqual(cell.properties);
      cell.ranges.forEach((range, layer) => {
        const replacement = after.index.cells[n].ranges[layer];
        expect(
          output.slice(
            replacement.offset,
            replacement.offset + replacement.length
          )
        ).toEqual(input.slice(range.offset, range.offset + range.length));
      });
    });
    expect(input).toEqual(inputCopy);
    expect(readObliqueAvifDocument(output)).toEqual(metadata);
  });

  it("exposes four physical resolutions and only cumulative per-cell dependencies", () => {
    const layout = parseNativeAvif(nativeFixture())!;
    for (const [level, width, height, edge, rangeCount] of [
      [1, 1024, 512, 512, 4],
      [2, 512, 256, 256, 3],
      [3, 256, 128, 128, 2],
      [4, 128, 64, 64, 1],
    ]) {
      const index = layout.levels.get(level)!;
      expect(index.dimensions).toEqual({ width, height });
      index.cells.forEach((cell, n) => {
        expect(cell.ranges).toEqual(
          layout.index.cells[n].ranges.slice(0, rangeCount)
        );
        expect(
          ispeSize(cell.properties.find((p) => p.type === "ispe")!.bytes)
        ).toEqual([edge, edge]);
        if (level !== 1)
          expect(
            cell.properties.some((p) => ["a1lx", "lsel"].includes(p.type))
          ).toBe(false);
      });
    }
  });

  it("places complete metadata and all base tiles in a short first response", () => {
    const output = embedObliqueAvifDocument(nativeFixture(), document()),
      layout = parseNativeAvif(output)!;
    expect(layout.previewPrefixEnd).toBeLessThan(128 * 1024);
    const prefix = output.slice(0, layout.previewPrefixEnd);
    expect(readObliqueAvifDocument(prefix)).toEqual(document());
    for (const cell of layout.index.cells) {
      expect(cell.ranges[0].offset + cell.ranges[0].length).toBeLessThanOrEqual(
        prefix.length
      );
      expect(cell.ranges[1].offset).toBeGreaterThanOrEqual(prefix.length);
    }
  });

  it("allows a real first response beyond 128KiB without truncating the document", () => {
    const metadata = document();
    metadata.provenance.note = "coverage ".repeat(24_000);
    const output = embedObliqueAvifDocument(nativeFixture(), metadata),
      layout = parseNativeAvif(output)!;
    expect(layout.previewPrefixEnd).toBeGreaterThan(128 * 1024);
    expect(
      readObliqueAvifDocument(output.slice(0, layout.previewPrefixEnd))
    ).toEqual(metadata);
  });

  it("replaces existing convention XMP without losing payloads or duplicating metadata records", () => {
    const first = embedObliqueAvifDocument(nativeFixture(), document()),
      changed = document();
    changed.catalogSnapshot.dataset.name = "Updated metadata";
    const second = embedObliqueAvifDocument(first, changed),
      before = parseNativeAvif(first)!,
      after = parseNativeAvif(second)!;
    expect(after.xmpRanges).toHaveLength(1);
    expect(readObliqueAvifDocument(second)).toEqual(changed);
    before.index.cells.forEach((cell, n) =>
      cell.ranges.forEach((r, layer) => {
        const s = after.index.cells[n].ranges[layer];
        expect(second.slice(s.offset, s.offset + s.length)).toEqual(
          first.slice(r.offset, r.offset + r.length)
        );
      })
    );
  });

  it("escapes XML metacharacters and preserves literal entity-looking JSON strings", () => {
    const metadata = document(),
      output = embedObliqueAvifDocument(nativeFixture(), metadata),
      layout = parseNativeAvif(output)!;
    const xmp = layout.xmpRanges[0],
      xml = new TextDecoder().decode(
        output.slice(xmp.offset, xmp.offset + xmp.length)
      );
    expect(xml).toContain("test-camera&lt;&amp;&gt;");
    expect(xml).toContain("&amp;lt;not markup&amp;gt;");
    expect(readObliqueAvifDocument(output)).toEqual(metadata);
  });

  it("rejects unsupported document versions rather than restoring a partial camera", () => {
    const invalid = {
      ...document(),
      version: 2,
    } as unknown as StandaloneAvifDocument;
    expect(() =>
      readObliqueAvifDocument(
        embedObliqueAvifDocument(nativeFixture(), invalid)
      )
    ).toThrow(/Unsupported|incomplete/);
  });

  it("distinguishes an ordinary native image from a standalone camera document", () => {
    expect(parseNativeAvif(nativeFixture())).not.toBeNull();
    expect(readObliqueAvifDocument(nativeFixture())).toBeNull();
  });

  it("rejects incomplete XMP and XML external declarations", () => {
    const output = embedObliqueAvifDocument(nativeFixture(), document()),
      layout = parseNativeAvif(output)!,
      range = layout.xmpRanges[0];
    expect(() =>
      readObliqueAvifDocument(
        output.slice(0, range.offset + range.length - 1),
        layout
      )
    ).toThrow(/Incomplete/);
    const hostile = output.slice();
    hostile.set(new TextEncoder().encode("<!DOCTYPE avif>"), range.offset);
    expect(() => readObliqueAvifDocument(hostile, layout)).toThrow(
      /External XML/
    );
  });

  it("bounds oversized XMP during assembly", () => {
    const metadata = document();
    metadata.provenance.note = "x".repeat(1024 * 1024);
    expect(() => embedObliqueAvifDocument(nativeFixture(), metadata)).toThrow(
      /metadata budget/
    );
  });
});
