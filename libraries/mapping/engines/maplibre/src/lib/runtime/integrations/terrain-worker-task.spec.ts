import { describe, expect, it } from "vitest";
import { executeTerrainWorkerTask } from "./terrain-worker-task";

describe("terrain worker mobile allocation ceiling", () => {
  it("reduces actual attributes and indices only for the explicit mobile baseline", async () => {
    const pixels = new Uint8ClampedArray(512 * 512 * 4);
    for (let i = 0; i < pixels.length; i += 4)
      pixels.set([128, 100, 0, 255], i);
    const task = {
      kind: "remesh" as const,
      id: { level: 15, x: 17023, y: 10926 },
      raster: { width: 512, height: 512, pixels },
      error: 1,
    };
    const native = await executeTerrainWorkerTask(task);
    const mobile = await executeTerrainWorkerTask({
      ...task,
      maximumMeshSegments: 128,
    });
    if (native.kind !== "remesh" || mobile.kind !== "remesh")
      throw new Error("Unexpected result");
    expect(native.tile.heightMeters.length).toBe(514 ** 2);
    expect(mobile.tile.heightMeters.length).toBe(129 ** 2);
    // The native path already reduces planar indices, but retains all attributes.
    expect(mobile.tile.heightMeters.byteLength).toBeLessThan(
      native.tile.heightMeters.byteLength / 15
    );
    expect(mobile.tile.byteLength).toBeLessThan(1024 * 1024);
    expect(mobile.tile.bounds).toEqual(native.tile.bounds);
    expect(mobile.tile.minimumHeightMeters).toBe(100);
    expect(mobile.tile.maximumHeightMeters).toBe(100);
    // The lossy baseline must not advertise the desktop residual certificate.
    expect(mobile.tile.reconstructionErrorMeters).toBeUndefined();
  });
});
