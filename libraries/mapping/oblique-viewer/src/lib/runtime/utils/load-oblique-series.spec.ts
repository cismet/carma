// @vitest-environment node
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObliqueDataset } from "../../core/types";
import { loadObliqueSeriesData } from "./load-oblique-series";
const parsing = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock("@carma-geo/proj", () => ({ getProj4Converter: () => ({}) }));
vi.mock("../../core/utils/imageRecord", () => ({
  buildImageRecords: parsing.build,
  summarizeObliquePitch: () => new Map(),
  wgs84ToDatasetXY: vi.fn(),
}));
const dataset = {
  id: "2026",
  crs: "EPSG:25832",
  metadataFormat: "inpho-v1",
  exteriorOrientationsURI: "https://images.test/catalog.json",
  compressedCatalogURI: "https://images.test/catalog.json.gz",
} as ObliqueDataset;
const text =
  '{"images":[{"id":"a","pose":[1.2345678901234567,-0,5e-324,1.7976931348623157e308],"assets":{"original":{"href":"photo.tif"},"pyramid":{"href":"photo.avif"}}}],"labels":["Wupper","äöü"]}';
const exact = JSON.parse(text);
const compressed = () =>
  new Response(gzipSync(text), {
    headers: { "Content-Type": "application/gzip" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  parsing.build.mockImplementation((_doc, series) => ({
    imageRecords: new Map(),
    dataset: series,
  }));
});
afterEach(() => vi.unstubAllGlobals());
describe("exact JSON gzip metadata transport", () => {
  it("decompresses native gzip and passes every document value unchanged to the existing builder", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValueOnce(compressed());
    await loadObliqueSeriesData(dataset, undefined, network);
    const parsed = parsing.build.mock.calls[0][0];
    expect(parsed).toStrictEqual(exact);
    expect(Object.is(parsed.images[0].pose[1], -0)).toBe(true);
    expect(parsed.images[0].pose[2]).toBe(5e-324);
    expect(network).toHaveBeenCalledOnce();
    expect(network.mock.calls[0][0]).toBe(dataset.compressedCatalogURI);
  });
  it("accepts a body already decompressed by HTTP without a second gzip pass", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(text, {
          headers: {
            "Content-Encoding": "gzip",
            "Content-Type": "application/json",
          },
        })
      );
    await loadObliqueSeriesData(dataset, undefined, network);
    expect(parsing.build.mock.calls[0][0]).toStrictEqual(exact);
    expect(network).toHaveBeenCalledOnce();
  });
  it.each(["missing", "invalid-gzip", "invalid-json", "invalid-schema"])(
    "falls back to canonical JSON when compressed catalog is %s",
    async (kind) => {
      const first =
        kind === "missing"
          ? new Response(null, { status: 404 })
          : kind === "invalid-gzip"
          ? new Response(new Uint8Array([0x1f, 0x8b, 0, 1]))
          : kind === "invalid-json"
          ? new Response("not json")
          : new Response(gzipSync('{"invalid":true}'));
      if (kind === "invalid-schema")
        parsing.build.mockImplementationOnce(() => {
          throw Error("invalid schema");
        });
      const network = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(new Response(text));
      await loadObliqueSeriesData(dataset, undefined, network);
      expect(network.mock.calls.map((call) => call[0])).toEqual([
        dataset.compressedCatalogURI,
        dataset.exteriorOrientationsURI,
      ]);
      expect(parsing.build.mock.calls.at(-1)![0]).toStrictEqual(exact);
    }
  );
  it("uses canonical JSON directly when native decompression is unavailable", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(text));
    await loadObliqueSeriesData(dataset, undefined, network);
    expect(network.mock.calls.map((call) => call[0])).toEqual([
      dataset.exteriorOrientationsURI,
    ]);
  });
  it("does not fall back after a signal cancellation during preferred transport", async () => {
    const controller = new AbortController(),
      network = vi.fn<typeof fetch>().mockImplementation(async () => {
        controller.abort();
        throw new DOMException("Cancelled", "AbortError");
      });
    await expect(
      loadObliqueSeriesData(dataset, controller.signal, network)
    ).rejects.toThrow();
    expect(network).toHaveBeenCalledOnce();
    expect(parsing.build).not.toHaveBeenCalled();
  });
  it("does not start any request for an already cancelled signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const network = vi.fn<typeof fetch>();
    await expect(
      loadObliqueSeriesData(dataset, controller.signal, network)
    ).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
});
