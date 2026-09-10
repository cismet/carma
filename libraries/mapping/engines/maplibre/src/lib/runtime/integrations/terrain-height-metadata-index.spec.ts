import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTerrainHeightMetadataIndex } from "./terrain-height-metadata-index";
import { runTerrainWorkerTask } from "./terrain-worker-client";

vi.mock("./terrain-worker-client", () => ({ runTerrainWorkerTask: vi.fn() }));
const producerAssetUrl = "https://terrain.test/assets/runtime-12345678.js";
const row = new Float64Array([16, 34000, 21800, 100, 200]);
describe("terrain metadata lifetime", () => {
  it("retries a metadata write yielded to foreground terrain without raster work", async () => {
    vi.mocked(runTerrainWorkerTask)
      .mockResolvedValueOnce({ kind: "read-height-metadata", ranges: null })
      .mockRejectedValueOnce(
        new DOMException("Cache yielded to visible terrain", "AbortError")
      )
      .mockResolvedValueOnce({ kind: "write-height-metadata", stored: true });
    const index = createTerrainHeightMetadataIndex("dem", { producerAssetUrl });
    await index.ready;
    index.record({
      id: { level: 16, x: 34000, y: 21800 },
      minimumHeightMeters: 100,
      maximumHeightMeters: 200,
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(
      vi.mocked(runTerrainWorkerTask).mock.calls.map(([task]) => task.kind)
    ).toEqual([
      "read-height-metadata",
      "write-height-metadata",
      "write-height-metadata",
    ]);
    index.dispose();
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("PROD", true);
    vi.mocked(runTerrainWorkerTask).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it("restores bounds without a raster/mesh task, and batches only changed metadata writes", async () => {
    vi.mocked(runTerrainWorkerTask).mockResolvedValue({
      kind: "read-height-metadata",
      ranges: row,
    });
    const index = createTerrainHeightMetadataIndex("dem-revision-1", {
      producerAssetUrl,
    });
    await index.ready;
    expect(index.snapshot()).toEqual({ "16/34000/21800": [100, 200] });
    const tile = {
      id: { level: 16, x: 34000, y: 21800 },
      minimumHeightMeters: 100,
      maximumHeightMeters: 201,
    };
    index.record(tile);
    index.record(tile);
    expect(runTerrainWorkerTask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      vi.mocked(runTerrainWorkerTask).mock.calls.map(([task]) => task.kind)
    ).toEqual(["read-height-metadata", "write-height-metadata"]);
    index.dispose();
  });
  it("uses late metadata without holding first fill beyond 50ms", async () => {
    let resolve!: (result: {
      kind: "read-height-metadata";
      ranges: Float64Array;
    }) => void;
    vi.mocked(runTerrainWorkerTask).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const onRestored = vi.fn();
    const index = createTerrainHeightMetadataIndex("dem", {
      producerAssetUrl,
      onRestored,
    });
    await vi.advanceTimersByTimeAsync(50);
    await index.ready;
    expect(index.snapshot()).toEqual({});
    resolve({ kind: "read-height-metadata", ranges: row });
    await vi.advanceTimersByTimeAsync(0);
    expect(index.snapshot()["16/34000/21800"]).toEqual([100, 200]);
    expect(onRestored).toHaveBeenCalledOnce();
    index.dispose();
  });
  it("keeps RAM observations when storage fails or development has no immutable epoch", async () => {
    vi.stubEnv("PROD", false);
    const index = createTerrainHeightMetadataIndex("dem", { producerAssetUrl });
    await index.ready;
    index.record({
      id: { level: 16, x: 34000, y: 21800 },
      minimumHeightMeters: 100,
      maximumHeightMeters: 200,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(index.snapshot()["16/34000/21800"]).toEqual([100, 200]);
    expect(runTerrainWorkerTask).not.toHaveBeenCalled();
    index.dispose();
  });
  it("ignores failed reads", async () => {
    vi.mocked(runTerrainWorkerTask).mockRejectedValue(
      new Error("storage unavailable")
    );
    const index = createTerrainHeightMetadataIndex("dem", { producerAssetUrl });
    await index.ready;
    expect(index.snapshot()).toEqual({});
    index.dispose();
  });
  it("aborts and ignores a late restore after disposal", async () => {
    let resolve!: (result: {
      kind: "read-height-metadata";
      ranges: Float64Array;
    }) => void;
    vi.mocked(runTerrainWorkerTask).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const onRestored = vi.fn();
    const index = createTerrainHeightMetadataIndex("dem", {
      producerAssetUrl,
      onRestored,
    });
    const signal = vi.mocked(runTerrainWorkerTask).mock.calls[0][1];
    index.dispose();
    expect(signal?.aborted).toBe(true);
    resolve({ kind: "read-height-metadata", ranges: row });
    await index.ready;
    expect(index.snapshot()).toEqual({});
    expect(onRestored).not.toHaveBeenCalled();
  });
});
