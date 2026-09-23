import { describe, expect, it } from "vitest";
import {
  addTileResourceTiming,
  emptyTilePipelineTotals,
  sampleTilePipeline,
  type TileResourceTiming,
} from "./tile-pipeline-sample";

const response = (
  patch: Partial<TileResourceTiming> = {}
): TileResourceTiming => ({
  name: "https://tiles.test/mesh.b3dm",
  duration: 400,
  requestStart: 100,
  responseStart: 300,
  responseEnd: 500,
  transferSize: 2 ** 20,
  encodedBodySize: 2 ** 19,
  ...patch,
});

describe("tile pipeline sample", () => {
  it("uses elapsed time, separates metadata and mesh, and does not mix wire bytes with file bytes", () => {
    const first = addTileResourceTiming(emptyTilePipelineTotals(), response());
    const totals = addTileResourceTiming(
      first,
      response({ name: "https://tiles.test/tileset.json" })
    );
    const sample = sampleTilePipeline(
      { ...totals, prepared: 3, presented: 2 },
      2000
    );
    expect(sample).toMatchObject({
      downloadsPerS: 0.5,
      metadataPerS: 0.5,
      downloadMiBs: 1,
      fileMiBs: 0.5,
      fileKiB: 512,
      ttfbMs: 200,
      bodyMs: 200,
      preparedPerS: 1.5,
      presentedPerS: 1,
    });
  });

  it("distinguishes a cache hit from a cross-origin response with hidden timing", () => {
    const cached = addTileResourceTiming(
      emptyTilePipelineTotals(),
      response({ transferSize: 0 })
    );
    expect(sampleTilePipeline(cached, 1000)).toMatchObject({
      downloadMiBs: 0,
      fileMiBs: 0.5,
      timingCoverage: 100,
    });
    const hidden = addTileResourceTiming(
      cached,
      response({
        transferSize: 0,
        encodedBodySize: 0,
        requestStart: 0,
        responseStart: 0,
      })
    );
    const sample = sampleTilePipeline(hidden, 1000);
    expect(sample.downloadMiBs).toBeNaN();
    expect(sample.fileMiBs).toBeNaN();
    expect(sample.timingCoverage).toBe(50);
    expect(sample.ttfbMs).toBe(200);
    const fromHeader = sampleTilePipeline(
      addTileResourceTiming(
        emptyTilePipelineTotals(),
        response({ transferSize: 0, encodedBodySize: 0 }),
        2 ** 20
      ),
      2000
    );
    expect(fromHeader.fileMiBs).toBe(0.5);
    expect(fromHeader.downloadMiBs).toBeNaN();
  });

  it("reports idle rates as zero and unobserved durations as unavailable", () => {
    const sample = sampleTilePipeline(emptyTilePipelineTotals(), 500);
    expect(sample.downloadMiBs).toBe(0);
    expect(sample.downloadsPerS).toBe(0);
    expect(sample.prepareMs).toBeNaN();
    expect(sample.ttfbMs).toBeNaN();
  });
});
