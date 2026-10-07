import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Radians } from "@carma-units";
import type { ObliqueDataset, ObliqueImageRecord } from "../../core/types";
import { useObliqueData, type ObliqueData } from "./useObliqueData";

class CatalogWorker {
  static instances: CatalogWorker[] = [];
  onmessage: ((event: MessageEvent<{ data: ObliqueData }>) => void) | null =
    null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    CatalogWorker.instances.push(this);
  }
  complete(dataset: ObliqueDataset, overrides: Partial<ObliqueData> = {}) {
    const data: ObliqueData = {
      datasets: new Map([[dataset.id, { ...dataset, animations: {} }]]),
      imageRecords: new Map(),
      centers: new Map(),
      ...overrides,
    };
    this.onmessage?.({ data: { data } } as MessageEvent<{ data: ObliqueData }>);
  }
}
let nextId = 0;
const dataset = (): ObliqueDataset =>
  ({
    id: "worker-lifecycle-" + nextId++,
    label: "Test series",
    exteriorOrientationsURI: "/orientations.json",
    animations: {},
  } as ObliqueDataset);
const mount = (series: ObliqueDataset, enabled = true) =>
  renderHook(
    (props: { series: readonly ObliqueDataset[]; enabled: boolean }) =>
      useObliqueData(props.series, props.enabled),
    { initialProps: { series: [series], enabled } }
  );
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => {
  CatalogWorker.instances = [];
  vi.stubGlobal("Worker", CatalogWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("catalog worker lifecycle", () => {
  it("does not start a worker while the basemap gate is closed", () => {
    mount(dataset(), false);
    expect(CatalogWorker.instances).toHaveLength(0);
  });
  it("cancels an unused pending worker and starts a fresh load on reactivation", async () => {
    const series = dataset();
    const view = mount(series);
    const first = CatalogWorker.instances[0];
    view.rerender({ series: [series], enabled: false });
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(first.onmessage).toBeNull();
    await flush();
    view.rerender({ series: [series], enabled: true });
    expect(CatalogWorker.instances).toHaveLength(2);
    expect(view.result.current.error).toBeNull();
  });
  it("keeps a shared pending worker until its last consumer releases it", () => {
    const series = dataset();
    const first = mount(series);
    const second = mount(series);
    expect(CatalogWorker.instances).toHaveLength(1);
    first.unmount();
    expect(CatalogWorker.instances[0].terminate).not.toHaveBeenCalled();
    second.unmount();
    expect(CatalogWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it("reuses a completed catalog after deactivation without another worker", async () => {
    const series = dataset();
    const view = mount(series);
    act(() => CatalogWorker.instances[0].complete(series));
    await flush();
    expect(view.result.current.data?.datasets.get(series.id)?.animations).toBe(
      series.animations
    );
    view.rerender({ series: [series], enabled: false });
    view.rerender({ series: [series], enabled: true });
    await flush();
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(view.result.current.data?.datasets.has(series.id)).toBe(true);
  });
  it("revalidates a completed in-memory catalog after the freshness interval", async () => {
    const series = dataset();
    const view = mount(series);
    act(() => CatalogWorker.instances[0].complete(series));
    await flush();
    view.rerender({ series: [series], enabled: false });
    act(() => vi.advanceTimersByTime(60001));
    view.rerender({ series: [series], enabled: true });
    expect(CatalogWorker.instances).toHaveLength(2);
  });

  it("merges worker pitch summaries and filters disabled series in the first render without rescanning records", async () => {
    const first = dataset(),
      second = dataset();
    const firstTotal = { pitchSumRad: (Math.PI / 2) as Radians, imageCount: 3 };
    const secondTotal = {
      pitchSumRad: (Math.PI / 3) as Radians,
      imageCount: 1,
    };
    const renders: Array<ObliqueData | null> = [];
    const view = renderHook(
      (props: { series: readonly ObliqueDataset[] }) => {
        const state = useObliqueData(props.series, true);
        renders.push(state.data);
        return state;
      },
      { initialProps: { series: [first, second] } }
    );
    const records = (series: ObliqueDataset, count: number) =>
      new Map(
        Array.from({ length: count }, (_, index) => {
          const id = series.id + ":" + index;
          return [
            id,
            { id, seriesId: series.id } as ObliqueImageRecord,
          ] as const;
        })
      );
    act(() => {
      CatalogWorker.instances[0].complete(first, {
        imageRecords: records(first, 3),
        obliquePitchBySeries: new Map([[first.id, firstTotal]]),
      });
      CatalogWorker.instances[1].complete(second, {
        imageRecords: records(second, 1),
        obliquePitchBySeries: new Map([[second.id, secondTotal]]),
      });
    });
    await flush();
    const summary = view.result.current.data!.obliquePitchBySeries!;
    expect([...summary.keys()]).toEqual([first.id, second.id]);
    expect(summary.get(first.id)).toBe(firstTotal);
    expect(summary.get(second.id)).toBe(secondTotal);
    const nextRender = renders.length;
    view.rerender({ series: [second] });
    const immediate = renders[nextRender]!;
    expect([...immediate.obliquePitchBySeries!.keys()]).toEqual([second.id]);
    expect(immediate.obliquePitchBySeries!.get(second.id)).toBe(secondTotal);
    expect(
      [...immediate.imageRecords.values()].every(
        (record) => record.seriesId === second.id
      )
    ).toBe(true);
    await flush();
    expect([...view.result.current.data!.obliquePitchBySeries!.keys()]).toEqual(
      [second.id]
    );
    expect(CatalogWorker.instances).toHaveLength(2);
    view.unmount();
  });

  it("terminates a timed-out worker and allows the next activation to retry", async () => {
    const series = dataset();
    const view = mount(series);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(CatalogWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(view.result.current.error).toContain("nicht rechtzeitig");
    view.rerender({ series: [series], enabled: false });
    view.rerender({ series: [series], enabled: true });
    expect(CatalogWorker.instances).toHaveLength(2);
  });
});

describe("static in-memory catalog revisions", () => {
  it("reuses a completed static catalog after the legacy freshness interval", async () => {
    const series = { ...dataset(), catalogVersion: "immutable-sha" };
    const view = mount(series);
    act(() =>
      CatalogWorker.instances[0].complete(series, {
        imageRecords: new Map([
          ["image", { id: "image", seriesId: series.id } as ObliqueImageRecord],
        ]),
      })
    );
    await flush();
    view.rerender({ series: [series], enabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000);
    });
    view.rerender({ series: [series], enabled: true });
    await flush();
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(view.result.current.isAllDataReady).toBe(true);
  });
  it("creates a new worker for a new revision but preserves the previous in-memory entry", async () => {
    const series = { ...dataset(), catalogVersion: "revision-one" };
    const view = mount(series);
    act(() =>
      CatalogWorker.instances[0].complete(series, {
        imageRecords: new Map([
          ["image", { id: "image", seriesId: series.id } as ObliqueImageRecord],
        ]),
      })
    );
    await flush();
    const newer = { ...series, catalogVersion: "revision-two" };
    view.rerender({ series: [newer], enabled: true });
    act(() =>
      CatalogWorker.instances[1].complete(newer, {
        imageRecords: new Map([
          ["image", { id: "image", seriesId: newer.id } as ObliqueImageRecord],
        ]),
      })
    );
    await flush();
    view.rerender({ series: [series], enabled: true });
    await flush();
    expect(CatalogWorker.instances).toHaveLength(2);
    expect(view.result.current.isAllDataReady).toBe(true);
  });
  it("recreates a legacy unversioned worker after bounded freshness expires", async () => {
    const series = dataset();
    const view = mount(series);
    act(() =>
      CatalogWorker.instances[0].complete(series, {
        imageRecords: new Map([
          ["image", { id: "image", seriesId: series.id } as ObliqueImageRecord],
        ]),
      })
    );
    await flush();
    view.rerender({ series: [series], enabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    view.rerender({ series: [series], enabled: true });
    expect(CatalogWorker.instances).toHaveLength(2);
  });
});

describe("catalog priority and stable configuration", () => {
  it("does not restart a pending catalog for an equivalent new config object", () => {
    const series = dataset();
    const view = mount(series);
    const worker = CatalogWorker.instances[0];
    view.rerender({
      series: [{ ...series, animations: { ...series.animations } }],
      enabled: true,
    });
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("loads the URL series before other enabled catalogs and publishes it first", async () => {
    const other = dataset(),
      priority = dataset();
    const view = renderHook(() =>
      useObliqueData([other, priority], true, { prioritySeriesId: priority.id })
    );
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(
      CatalogWorker.instances[0].postMessage.mock.calls[0][0].dataset.id
    ).toBe(priority.id);
    act(() => CatalogWorker.instances[0].complete(priority));
    await flush();
    expect(view.result.current.data?.datasets.has(priority.id)).toBe(true);
    expect(
      view.result.current.perSeries.find((status) => status.id === priority.id)
        ?.isLoading
    ).toBe(false);
    expect(CatalogWorker.instances).toHaveLength(2);
    expect(
      CatalogWorker.instances[1].postMessage.mock.calls[0][0].dataset.id
    ).toBe(other.id);
  });

  it("starts the other catalogs if the preferred series fails", async () => {
    const other = dataset(),
      priority = dataset();
    const view = renderHook(() =>
      useObliqueData([other, priority], true, { prioritySeriesId: priority.id })
    );
    act(() =>
      CatalogWorker.instances[0].onerror?.(new Event("error") as ErrorEvent)
    );
    await flush();
    expect(CatalogWorker.instances).toHaveLength(2);
    expect(
      view.result.current.perSeries.find((status) => status.id === priority.id)
        ?.error
    ).toBeTruthy();
  });

  it("does not start deferred catalogs after deactivation", async () => {
    const other = dataset(),
      priority = dataset();
    const view = renderHook(
      ({ enabled }) =>
        useObliqueData([other, priority], enabled, {
          prioritySeriesId: priority.id,
        }),
      { initialProps: { enabled: true } }
    );
    view.rerender({ enabled: false });
    await flush();
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(CatalogWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
});

describe("catalog map publication", () => {
  it("reuses a loaded catalog when another series changes only its error status", async () => {
    const first = dataset(),
      second = dataset();
    const view = renderHook(() => useObliqueData([first, second], true));
    act(() => CatalogWorker.instances[0].complete(first));
    await flush();
    const loaded = view.result.current.data;
    expect(loaded?.datasets.has(first.id)).toBe(true);
    act(() =>
      CatalogWorker.instances[1].onerror?.(new Event("error") as ErrorEvent)
    );
    await flush();
    expect(view.result.current.data).toBe(loaded);
    expect(
      view.result.current.perSeries.find((status) => status.id === second.id)
        ?.error
    ).toBeTruthy();
  });
});

describe("directional catalogs", () => {
  const grouped = () => {
    const series = dataset();
    series.directionalCatalogs = ["N", "E", "S", "W"].map((sector, index) => ({
      id: sector,
      sector: sector as "N" | "E" | "S" | "W",
      cameraIds: [sector],
      meanHeadingRad: index as Radians,
      imageCount: index + 1,
      obliquePitch: {
        pitchSumRad: (index + 1) as Radians,
        imageCount: index + 1,
      },
      exteriorOrientationsURI: `/${series.id}-${sector}.json`,
    }));
    return series;
  };
  const completeGroup = (
    worker: CatalogWorker,
    series: ObliqueDataset,
    group: string,
    count = 1
  ) => {
    const source = worker.postMessage.mock.calls[0][0]
      .dataset as ObliqueDataset;
    worker.complete(source, {
      imageRecords: new Map(
        Array.from({ length: count }, (_, i) => {
          const id = `${series.id}:${group}:${i}`;
          return [id, { id, seriesId: series.id } as ObliqueImageRecord];
        })
      ),
      obliquePitchBySeries: new Map([
        [series.id, { pitchSumRad: count as Radians, imageCount: count }],
      ]),
    });
  };
  it("starts only the restored image group, publishes before idle loads and keeps full pitch mean stable", async () => {
    const series = grouped();
    const view = renderHook(() =>
      useObliqueData([series], true, { priorityImageId: "E_01_12" })
    );
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(
      CatalogWorker.instances[0].postMessage.mock.calls[0][0].dataset
        .exteriorOrientationsURI
    ).toContain("-E.json");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31);
    });
    expect(CatalogWorker.instances).toHaveLength(1);
    act(() => completeGroup(CatalogWorker.instances[0], series, "E"));
    await flush();
    expect(view.result.current.data?.imageRecords.size).toBe(1);
    expect(view.result.current.data?.datasets.size).toBe(1);
    expect(view.result.current.perSeries[0].isLoading).toBe(true);
    expect(view.result.current.isAllDataReady).toBe(true);
    expect(view.result.current.isCatalogComplete).toBe(false);
    expect(view.result.current.perSeries[0].obliqueComplete).toBe(false);
    expect(
      view.result.current.data?.obliquePitchBySeries?.get(series.id)
    ).toEqual({ pitchSumRad: 10, imageCount: 10 });
    expect(CatalogWorker.instances).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });
    expect(CatalogWorker.instances).toHaveLength(2);
    act(() => completeGroup(CatalogWorker.instances[1], series, "N"));
    await flush();
    expect(
      view.result.current.data?.obliquePitchBySeries?.get(series.id)
    ).toEqual({ pitchSumRad: 10, imageCount: 10 });
  });
  it("promotes an urgent bearing without terminating the active worker and resolves after visible publication", async () => {
    const series = grouped();
    const view = renderHook(
      ({ heading }) =>
        useObliqueData([series], true, { priorityHeadingRad: heading }),
      { initialProps: { heading: 0 as Radians } }
    );
    view.rerender({ heading: 2 as Radians });
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(CatalogWorker.instances[0].terminate).not.toHaveBeenCalled();
    let resolved: ObliqueData | null | undefined;
    let waiting: Promise<void>;
    act(() => {
      waiting = view.result.current
        .awaitDirection(2 as Radians)
        .then((data) => {
          resolved = data;
        });
    });
    act(() => completeGroup(CatalogWorker.instances[0], series, "N"));
    await flush();
    expect(CatalogWorker.instances).toHaveLength(2);
    expect(
      CatalogWorker.instances[1].postMessage.mock.calls[0][0].dataset
        .exteriorOrientationsURI
    ).toContain("-S.json");
    act(() => completeGroup(CatalogWorker.instances[1], series, "S"));
    await flush();
    await waiting!;
    expect(resolved).toBe(view.result.current.data);
    expect(resolved?.imageRecords.has(`${series.id}:S:0`)).toBe(true);
    expect(resolved?.datasets.size).toBe(1);
  });
  it("retains successful chunks after segment failure and retries only that segment, never the monolith", async () => {
    const series = grouped();
    const view = mount(series);
    act(() => completeGroup(CatalogWorker.instances[0], series, "N"));
    await flush();
    const firstRecord = view.result.current.data!.imageRecords.get(
      `${series.id}:N:0`
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });
    const waiting = view.result.current.awaitDirection(1 as Radians);
    act(() => CatalogWorker.instances[1].onerror?.());
    await flush();
    await expect(waiting).resolves.toBeNull();
    expect(CatalogWorker.instances).toHaveLength(2);
    expect(view.result.current.data?.imageRecords.get(`${series.id}:N:0`)).toBe(
      firstRecord
    );
    expect(view.result.current.error).toContain("E:");
    await expect(
      view.result.current.awaitDirection(1 as Radians)
    ).resolves.toBeNull();
    expect(CatalogWorker.instances).toHaveLength(2);
    let retry!: Promise<ObliqueData | null>;
    act(() => {
      retry = view.result.current.awaitDirection(1 as Radians, { retry: true });
    });
    expect(CatalogWorker.instances).toHaveLength(3);
    expect(
      CatalogWorker.instances[2].postMessage.mock.calls[0][0].dataset
        .exteriorOrientationsURI
    ).toContain("-E.json");
    act(() => completeGroup(CatalogWorker.instances[2], series, "E", 2));
    await flush();
    await expect(retry).resolves.toBe(view.result.current.data);
    expect(view.result.current.data?.imageRecords.size).toBe(3);
    expect(view.result.current.data?.imageRecords.get(`${series.id}:N:0`)).toBe(
      firstRecord
    );
    expect(view.result.current.error).toBeNull();
    for (const worker of CatalogWorker.instances)
      expect(
        worker.postMessage.mock.calls[0][0].dataset.exteriorOrientationsURI
      ).not.toContain("/orientations.json");
  });
  it("merges all disjoint group records and exposes one canonical dataset", async () => {
    const series = grouped();
    const view = mount(series);
    for (let index = 0; index < 4; index++) {
      if (index)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(32);
        });
      act(() =>
        completeGroup(
          CatalogWorker.instances[index],
          series,
          ["N", "E", "S", "W"][index],
          index + 1
        )
      );
      await flush();
    }
    expect(view.result.current.data?.imageRecords.size).toBe(10);
    expect(
      view.result.current.data?.datasets.get(series.id)?.exteriorOrientationsURI
    ).toBe(series.exteriorOrientationsURI);
    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.perSeries[0].imageCount).toBe(10);
    expect(view.result.current.isCatalogComplete).toBe(true);
    expect(view.result.current.perSeries[0].obliqueComplete).toBe(true);
    expect(CatalogWorker.instances).toHaveLength(4);
  });
  it("awaitAll urgently finishes every group and returns the committed full catalog", async () => {
    const series = grouped();
    const view = mount(series);
    let resolved: ObliqueData | null | undefined;
    const waiting = view.result.current.awaitAll().then((data) => {
      resolved = data;
    });
    for (let index = 0; index < 4; index++) {
      act(() =>
        completeGroup(
          CatalogWorker.instances[index],
          series,
          ["N", "E", "S", "W"][index],
          index + 1
        )
      );
      await flush();
    }
    await waiting;
    expect(resolved).toBe(view.result.current.data);
    expect(resolved?.imageRecords.size).toBe(10);
    expect(view.result.current.isLoading).toBe(false);
  });
  it("reuses a committed loaded direction without scanning record Maps or starting another group", async () => {
    const series = grouped();
    const view = mount(series);
    act(() => completeGroup(CatalogWorker.instances[0], series, "N"));
    await flush();
    const data = view.result.current.data!;
    const keys = vi.spyOn(data.imageRecords, "keys");
    const values = vi.spyOn(data.imageRecords, "values");
    await expect(
      view.result.current.awaitDirection(0 as Radians)
    ).resolves.toBe(data);
    await expect(
      view.result.current.awaitDirection(0 as Radians)
    ).resolves.toBe(data);
    expect(keys).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
    expect(CatalogWorker.instances).toHaveLength(1);
  });
  it("reports failed segments without any canonical recovery request", async () => {
    const series = grouped();
    const view = mount(series);
    const waiting = view.result.current.awaitDirection(0 as Radians);
    act(() => CatalogWorker.instances[0].onerror?.());
    await flush();
    await expect(waiting).resolves.toBeNull();
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(view.result.current.error).toBeTruthy();
    const all = view.result.current.awaitAll();
    for (let index = 1; index < 4; index++) {
      act(() =>
        completeGroup(
          CatalogWorker.instances[index],
          series,
          ["N", "E", "S", "W"][index],
          index + 1
        )
      );
      await flush();
    }
    await expect(all).resolves.toBeNull();
    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.data?.imageRecords.size).toBe(9);
    expect(view.result.current.isAllDataReady).toBe(true);
    expect(view.result.current.isCatalogComplete).toBe(false);
    expect(view.result.current.perSeries[0].obliqueComplete).toBe(false);
    for (const worker of CatalogWorker.instances)
      expect(
        worker.postMessage.mock.calls[0][0].dataset.exteriorOrientationsURI
      ).not.toContain("/orientations.json");
  });
  it("loads exactly four oblique segments into one series and defers nadir until requested", async () => {
    const series = grouped();
    series.directionalCatalogs = [
      ...series.directionalCatalogs!,
      {
        id: "NA",
        sector: "nadir",
        cameraIds: ["NA"],
        meanHeadingRad: 0 as Radians,
        imageCount: 7,
        obliquePitch: { pitchSumRad: 0 as Radians, imageCount: 0 },
        exteriorOrientationsURI: `/${series.id}-NA.json`,
      },
    ];
    const view = mount(series);
    for (let index = 0; index < 4; index++) {
      if (index)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(32);
        });
      act(() =>
        completeGroup(
          CatalogWorker.instances[index],
          series,
          ["N", "E", "S", "W"][index],
          index + 1
        )
      );
      await flush();
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(64);
    });
    expect(CatalogWorker.instances).toHaveLength(4);
    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.data?.datasets.size).toBe(1);
    expect(view.result.current.data?.imageRecords.size).toBe(10);
    expect(view.result.current.isCatalogComplete).toBe(true);
    await expect(view.result.current.awaitAll()).resolves.toBe(
      view.result.current.data
    );
    let nadir!: Promise<ObliqueData | null>;
    act(() => {
      nadir = view.result.current.awaitDirection(0 as Radians, {
        cameraView: "nadir",
      });
    });
    expect(CatalogWorker.instances).toHaveLength(5);
    expect(view.result.current.isCatalogComplete).toBe(true);
    expect(
      CatalogWorker.instances[4].postMessage.mock.calls[0][0].dataset
        .exteriorOrientationsURI
    ).toContain("-NA.json");
    act(() => completeGroup(CatalogWorker.instances[4], series, "NA", 7));
    await flush();
    await expect(nadir).resolves.toBe(view.result.current.data);
    expect(view.result.current.data?.imageRecords.size).toBe(17);
    expect(
      view.result.current.data?.obliquePitchBySeries?.get(series.id)
    ).toEqual({ pitchSumRad: 10, imageCount: 10 });
  });
  it("cancels the active group and direction waiter without starting queued segments", async () => {
    const series = grouped();
    const view = mount(series);
    const waiting = view.result.current.awaitDirection(2 as Radians);
    view.unmount();
    await expect(waiting).resolves.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(64);
    });
    expect(CatalogWorker.instances).toHaveLength(1);
    expect(CatalogWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it("never claims completeness when a required oblique sector is absent from the configured parts", async () => {
    const series = grouped();
    series.directionalCatalogs = series.directionalCatalogs!.filter(
      (group) => group.sector !== "W"
    );
    const view = mount(series),
      all = view.result.current.awaitAll();
    for (let index = 0; index < 3; index++) {
      act(() =>
        completeGroup(
          CatalogWorker.instances[index],
          series,
          ["N", "E", "S"][index]
        )
      );
      await flush();
    }
    await all;
    expect(view.result.current.isAllDataReady).toBe(true);
    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.isCatalogComplete).toBe(false);
    expect(view.result.current.perSeries[0].obliqueComplete).toBe(false);
  });
  it("does not let a failed on-demand nadir part undo complete oblique catalogs", async () => {
    const series = grouped();
    series.directionalCatalogs = [
      ...series.directionalCatalogs!,
      {
        id: "NA",
        sector: "nadir",
        cameraIds: ["NA"],
        meanHeadingRad: 0 as Radians,
        imageCount: 1,
        exteriorOrientationsURI: `/${series.id}-NA.json`,
      },
    ];
    const view = mount(series),
      all = view.result.current.awaitAll();
    for (let index = 0; index < 4; index++) {
      act(() =>
        completeGroup(
          CatalogWorker.instances[index],
          series,
          ["N", "E", "S", "W"][index]
        )
      );
      await flush();
    }
    await all;
    const nadir = view.result.current.awaitDirection(0 as Radians, {
      cameraView: "nadir",
    });
    act(() => CatalogWorker.instances[4].onerror?.());
    await flush();
    await expect(nadir).resolves.toBeNull();
    expect(view.result.current.error).toContain("NA:");
    expect(view.result.current.isCatalogComplete).toBe(true);
    expect(view.result.current.perSeries[0].obliqueComplete).toBe(true);
  });
});

describe("complete enabled catalog aggregate", () => {
  it("requires each enabled canonical success, ignores a disabled failed series and treats no enabled series as incomplete", async () => {
    const first = dataset(),
      second = dataset();
    const view = renderHook(({ series }) => useObliqueData(series, true), {
      initialProps: { series: [first, second] },
    });
    act(() =>
      CatalogWorker.instances[0].complete(first, {
        imageRecords: new Map([
          ["photo", { id: "photo", seriesId: first.id } as ObliqueImageRecord],
        ]),
      })
    );
    await flush();
    expect(view.result.current.isAllDataReady).toBe(true);
    expect(view.result.current.isCatalogComplete).toBe(false);
    act(() => CatalogWorker.instances[1].onerror?.());
    await flush();
    expect(view.result.current.isCatalogComplete).toBe(false);
    view.rerender({ series: [first] });
    await flush();
    expect(view.result.current.isCatalogComplete).toBe(true);
    expect(view.result.current.error).toBeNull();
    view.rerender({ series: [] });
    expect(view.result.current.isCatalogComplete).toBe(false);
  });
  it("does not reuse a complete flag for changed calibration/source configuration with the same series ID", async () => {
    const series = dataset(),
      view = mount(series);
    act(() =>
      CatalogWorker.instances[0].complete(series, {
        imageRecords: new Map([
          ["photo", { id: "photo", seriesId: series.id } as ObliqueImageRecord],
        ]),
      })
    );
    await flush();
    expect(view.result.current.isCatalogComplete).toBe(true);
    view.rerender({
      series: [{ ...series, referenceGroundHeightMeters: 300 }],
      enabled: true,
    });
    expect(view.result.current.isCatalogComplete).toBe(false);
    expect(CatalogWorker.instances).toHaveLength(2);
  });
});
