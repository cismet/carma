import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Radians } from "@carma-units";
import type { ObliqueDataset } from "../../core/types";
import type { CatalogPriority } from "../../core/utils/directional-catalog";
import {
  createDirectionalCatalogQueue,
  type CatalogRequestOptions,
} from "./directional-catalog-queue";
import type { ObliqueData } from "./load-oblique-series";

type Call = {
  uri: string;
  options?: CatalogRequestOptions;
  resolve: (data: ObliqueData) => void;
};
const grouped = (id: string): ObliqueDataset =>
  ({
    id,
    label: id,
    exteriorOrientationsURI: `/${id}.json`,
    animations: {},
    directionalCatalogs: (["N", "E", "S", "W"] as const).map(
      (sector, index) => ({
        id: sector,
        sector,
        cameraIds: [sector],
        meanHeadingRad: index as Radians,
        imageCount: 1,
        exteriorOrientationsURI: `/${id}-${sector}.json`,
      })
    ),
  } as ObliqueDataset);
const canonical = (id: string): ObliqueDataset =>
  ({
    id,
    label: id,
    exteriorOrientationsURI: `/${id}.json`,
    animations: {},
  } as ObliqueDataset);
const empty = (): ObliqueData => ({
  imageRecords: new Map(),
  datasets: new Map(),
  centers: new Map(),
});
const setup = (
  datasets: readonly ObliqueDataset[],
  priority: CatalogPriority
) => {
  const calls: Call[] = [];
  const queue = createDirectionalCatalogQueue({
    datasets,
    priority,
    acquire: (source, options) => {
      let resolve!: (data: ObliqueData) => void;
      const promise = new Promise<ObliqueData>((done) => {
        resolve = done;
      });
      calls.push({ uri: source.exteriorOrientationsURI, options, resolve });
      return { promise, release: () => {} };
    },
    publish: () => {},
    merge: () => empty(),
  });
  const complete = async (index: number) => {
    calls[index].resolve(empty());
    await vi.advanceTimersByTimeAsync(64);
  };
  return { calls, queue, complete };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("directional catalog queue order", () => {
  it("loads every part of the priority series before another series starts", async () => {
    const { calls, queue, complete } = setup(
      [canonical("2024"), grouped("2026")],
      { prioritySeriesId: "2026", priorityHeadingRad: 0 as Radians }
    );
    for (let index = 0; index < 4; index++) await complete(index);
    expect(calls.map((call) => call.uri)).toEqual([
      "/2026-N.json",
      "/2026-E.json",
      "/2026-S.json",
      "/2026-W.json",
      "/2024.json",
    ]);
    expect(calls.slice(0, 4).map((call) => call.options)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(calls[4].options).toEqual({ fetchPriority: "low" });
    queue.cancel();
  });

  it("keeps normal fetch priority for an urgent request of another series", async () => {
    const { calls, queue } = setup([canonical("2024"), grouped("2026")], {
      prioritySeriesId: "2026",
      priorityHeadingRad: 0 as Radians,
    });
    void queue.promote({ prioritySeriesId: "2024" });
    calls[0].resolve(empty());
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[1].uri).toBe("/2024.json");
    expect(calls[1].options).toBeUndefined();
    queue.cancel();
  });
});

describe("directional catalog queue hold", () => {
  it("defers idle parts until every hold is released while urgent parts still load", async () => {
    const { calls, queue, complete } = setup([grouped("2026")], {
      priorityHeadingRad: 0 as Radians,
    });
    const first = queue.hold(),
      second = queue.hold();
    await complete(0);
    expect(calls).toHaveLength(1);
    void queue.promote({ priorityHeadingRad: 2 as Radians });
    expect(calls.map((call) => call.uri)).toEqual([
      "/2026-N.json",
      "/2026-S.json",
    ]);
    await complete(1);
    expect(calls).toHaveLength(2);
    first();
    first();
    await vi.advanceTimersByTimeAsync(64);
    expect(calls).toHaveLength(2);
    second();
    await vi.advanceTimersByTimeAsync(64);
    expect(calls.map((call) => call.uri)).toEqual([
      "/2026-N.json",
      "/2026-S.json",
      "/2026-E.json",
    ]);
    queue.cancel();
  });

  it("lets awaitAll-style requests finish every part while held", async () => {
    const { calls, queue, complete } = setup([grouped("2026")], {
      priorityHeadingRad: 0 as Radians,
    });
    const release = queue.hold();
    const all = queue.all();
    for (let index = 0; index < 4; index++) await complete(index);
    await expect(all).resolves.not.toBeNull();
    expect(calls).toHaveLength(4);
    release();
    queue.cancel();
  });
});
