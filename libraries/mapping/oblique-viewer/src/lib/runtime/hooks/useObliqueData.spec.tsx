import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObliqueDataset } from "../../core/types";
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
  complete(dataset: ObliqueDataset) {
    const data: ObliqueData = {
      datasets: new Map([[dataset.id, { ...dataset, animations: {} }]]),
      imageRecords: new Map(),
      centers: new Map(),
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
