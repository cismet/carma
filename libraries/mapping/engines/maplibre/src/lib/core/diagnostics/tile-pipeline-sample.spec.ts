import { describe, expect, it } from "vitest";
import {
  addTileResourceTiming,
  emptyTilePipelineTotals,
  sampleTilePipeline,
  sampleVisibleTileQuality,
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
        { contentLength: 2 ** 20 }
      ),
      2000
    );
    expect(fromHeader.fileMiBs).toBe(0.5);
    expect(fromHeader.downloadMiBs).toBeNaN();
  });

  it("uses observed body-read duration only when Resource Timing is hidden", () => {
    const observed = addTileResourceTiming(
      emptyTilePipelineTotals(),
      response({
        transferSize: 0,
        encodedBodySize: 0,
        requestStart: 0,
        responseStart: 0,
      }),
      { bodyReadMs: 450 }
    );
    const sample = sampleTilePipeline(observed, 1000);
    expect(sample.bodyMs).toBe(450);
    expect(sample.ttfbMs).toBeNaN();
    expect(sample.downloadMiBs).toBeNaN();
    expect(sample.fileMiBs).toBeNaN();
    const native = addTileResourceTiming(observed, response(), {
      bodyReadMs: 999,
    });
    expect(sampleTilePipeline(native, 1000).bodyMs).toBe(325);
    expect(sampleTilePipeline(native, 1000).ttfbMs).toBe(200);
  });

  it("reports idle rates as zero and unobserved durations as unavailable", () => {
    const sample = sampleTilePipeline(emptyTilePipelineTotals(), 500);
    expect(sample.downloadMiBs).toBe(0);
    expect(sample.downloadsPerS).toBe(0);
    expect(sample.prepareMs).toBeNaN();
    expect(sample.ttfbMs).toBeNaN();
  });
});

describe("visible geometric quality sample", () => {
  it("weights by clipped footprint area and treats exactly 20 CSS pixels as within threshold", () => {
    const observations = [
      { errorCssPixels: 40, areaCssPixels: 100 },
      { errorCssPixels: 20, areaCssPixels: 300 },
    ];
    expect(sampleVisibleTileQuality(observations, 1000)).toEqual({
      over20Since: 1000,
      metrics: {
        visibleErrorMaxPx: 40,
        visibleErrorMeanPx: 25,
        visibleOver20Percent: 25,
        visibleOver20Ms: 0,
        visibleErrorKnownTiles: 2,
        visibleErrorUnknownTiles: 0,
      },
    });
    expect(
      sampleVisibleTileQuality(observations, 2500, 1000).metrics.visibleOver20Ms
    ).toBe(1500);
    const refined = [{ errorCssPixels: 6, areaCssPixels: 400 }];
    expect(sampleVisibleTileQuality(refined, 3000, 1000)).toMatchObject({
      over20Since: null,
      metrics: {
        visibleErrorMaxPx: 6,
        visibleOver20Percent: 0,
        visibleOver20Ms: 0,
      },
    });
  });

  it("reports missing or invalid measurements as unavailable rather than perfect quality", () => {
    const missing = sampleVisibleTileQuality([], 1000, 500);
    expect(missing.over20Since).toBeNull();
    expect(missing.metrics.visibleErrorMaxPx).toBeNaN();
    expect(missing.metrics.visibleErrorMeanPx).toBeNaN();
    expect(missing.metrics.visibleOver20Percent).toBeNaN();
    expect(missing.metrics.visibleOver20Ms).toBeNaN();
    const partial = sampleVisibleTileQuality(
      [
        { errorCssPixels: 10, areaCssPixels: 100 },
        { errorCssPixels: Infinity, areaCssPixels: 200 },
        { errorCssPixels: 30, areaCssPixels: 0 },
      ],
      1000
    );
    expect(partial.metrics).toMatchObject({
      visibleErrorKnownTiles: 1,
      visibleErrorUnknownTiles: 2,
      visibleErrorMaxPx: 10,
      visibleErrorMeanPx: 10,
    });
    expect(partial.metrics.visibleOver20Ms).toBeNaN();
  });
});
