// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { TerrainMemoryDeferredError } from "../../core/terrain-memory-admission";
import { loadRasterDemTerrainStages } from "./raster-dem-terrain-stage-loading";

const entry = (x: number) => ({
  id: { level: 1, x, y: 0 },
  kind: "source" as const,
});
const fixture = () => ({
  current: () => true,
  concurrency: () => 1,
  setProgress: vi.fn(),
  publishInBackground: vi.fn(),
  requestPublication: vi.fn(async () => {}),
});

describe("terrain stage memory deferral", () => {
  it("finishes prepaid siblings at later ranks while deferring unrelated finer entries", async () => {
    const prepared: number[] = [];
    const reserved = new Set<number>();
    const result = await loadRasterDemTerrainStages({
      ...fixture(),
      stages: [[entry(0), entry(2)], [entry(3)], [entry(1)]],
      scheduledCount: 4,
      admitEntry: ({ id }) => {
        if (id.x === 0) {
          reserved.add(0);
          reserved.add(1);
        }
        return reserved.has(id.x);
      },
      hasEntryReservation: ({ id }) => reserved.has(id.x),
      prepareEntry: async ({ id }) => {
        prepared.push(id.x);
        reserved.delete(id.x);
      },
    });
    expect(prepared).toEqual([0, 1]);
    expect(result).toEqual({ failures: [], memoryDeferred: true });
  });

  it("keeps memory rejection separate from load failures and still drains admitted work", async () => {
    const prepared: number[] = [];
    const result = await loadRasterDemTerrainStages({
      ...fixture(),
      stages: [[entry(0), entry(1)]],
      scheduledCount: 2,
      prepareEntry: async ({ id }) => {
        if (id.x === 0) throw new TerrainMemoryDeferredError();
        prepared.push(id.x);
      },
    });
    expect(prepared).toEqual([1]);
    expect(result).toEqual({ failures: [], memoryDeferred: true });
  });
});
