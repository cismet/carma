import { describe, expect, it, vi } from "vitest";

import {
  createIdlePrefetchFixture,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";

const settleTimers = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("buildRasterDemTerrainRuntime foreground network pause", () => {
  installRasterDemTerrainRuntimeFixture();

  it("starts no source request while paused and resumes the same selection", async () => {
    const f = createIdlePrefetchFixture("loading-pause");
    try {
      f.runtime.setLoadingPaused?.(true);
      await f.start();
      await vi.waitFor(() =>
        expect(f.runtime.getRequestDemand?.()).toBeGreaterThan(0)
      );
      await settleTimers();
      expect(f.source.requestTile).not.toHaveBeenCalled();
      f.runtime.setLoadingPaused?.(false);
      await vi.waitFor(() => expect(f.source.requestTile).toHaveBeenCalled());
      await vi.waitFor(() => expect(f.source.trimCache).toHaveBeenCalledOnce());
      expect(f.onError).not.toHaveBeenCalled();
    } finally {
      f.runtime.dispose();
    }
  });

  it("keeps the demand pause independent and drops waiting work on dispose", async () => {
    const f = createIdlePrefetchFixture("loading-pause-dispose");
    f.runtime.setLoadingPaused?.(true);
    await f.start();
    await vi.waitFor(() =>
      expect(f.runtime.getRequestDemand?.()).toBeGreaterThan(0)
    );
    // Lifting the demand pause does not lift the network pause.
    f.runtime.setTileDemandPaused(false);
    await settleTimers();
    expect(f.source.requestTile).not.toHaveBeenCalled();
    f.runtime.dispose();
    await settleTimers();
    expect(f.source.requestTile).not.toHaveBeenCalled();
    expect(f.onError).not.toHaveBeenCalled();
  });
});
