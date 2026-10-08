import { act, renderHook } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import { useVisibleFootprints } from "./useVisibleFootprints";

class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerStub.instances.push(this);
  }
  reply(data: object) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const record = {
  id: "loaded:image",
  seriesId: "loaded",
  cameraId: "camera",
  pose: { bearingDeg: 0 },
  footprint: [
    [7, 51],
    [7.01, 51],
    [7.01, 51.01],
    [7, 51.01],
    [7, 51],
  ],
} as ObliqueImageRecord;
const data: ObliqueSelectionData = {
  imageRecords: new Map([[record.id, record]]),
  datasets: new Map([
    ["loaded", { cameras: { camera: {} } } as ObliqueDataset],
  ]),
  centers: new Map(),
};
const setup = (
) => {
  const listeners = new Map<string, () => void>();
  const renders = vi.fn();
  const map = {
    transform: { width: 100, height: 100, centerOffset: { x: 0, y: 0 } },
    unproject: vi.fn(([x, y]: [number, number]) => ({
      lng: 7 + x / 10000,
      lat: 51 + y / 10000,
    })),
    getCenter: () => ({ lng: 7.005, lat: 51.005 }),
    getBearing: vi.fn(() => 0),
    getPitch: () => 45,
    getZoom: () => 17,
    getVerticalFieldOfView: () => 36,
    on: vi.fn((event: string, handler: () => void) => {
      listeners.set(event, handler);
    }),
    off: vi.fn((event: string) => listeners.delete(event)),
  } as unknown as MaplibreMap;
  const props = {
    map,
    data,
    enabled: true,
    locked: false,
    viewMode: "oblique" as const,
  };
  return {
    ...renderHook(
      (options) => {
        renders();
        return useVisibleFootprints(options);
      },
      { initialProps: props }
    ),
    props,
    listeners,
    renders,
  };
};

const flushCatalog = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  const worker = WorkerStub.instances[0];
  const completed = worker?.postMessage.mock.calls
    .map(([message]) => message)
    .reverse()
    .find((message) => message.type === "init" && message.complete);
  if (completed)
    act(() => worker.reply({ type: "ready", revision: completed.revision }));
};

beforeEach(() => {
  WorkerStub.instances = [];
  vi.stubGlobal("Worker", WorkerStub);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pointer-driven footprint viewport queries", () => {
  it("transfers center-only metadata and hydrates only matching response records before resolving hover", async () => {
    const view = setup();
    const camera = {
      ...record,
      footprint: undefined,
      footprintApproximate: true,
    };
    const metadata = { ...data, imageRecords: new Map([[camera.id, camera]]) };
    view.rerender({ ...view.props, data: metadata });
    const worker = WorkerStub.instances[0];
    await flushCatalog();
    expect(
      worker.postMessage.mock.calls[0][0].data.imageRecords.get(camera.id)
        .footprint
    ).toBeUndefined();
    const viewport = worker.postMessage.mock.calls.find(
      ([message]) => message.type === "query"
    )![0];
    act(() =>
      worker.reply({
        type: "result",
        requestId: viewport.requestId,
        ids: [camera.id],
        footprints: [
          { id: camera.id, ring: record.footprint, approximate: true },
          { id: "foreign", ring: record.footprint },
        ],
      })
    );
    expect(view.result.current.records[0]).toBe(camera);
    expect(camera.footprint).toEqual(record.footprint);
    let pending: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint([7.006, 51.004]);
    });
    const hover = worker.postMessage.mock.lastCall![0];
    const changed = record.footprint!.map(([x, y]) => [x + 0.0001, y]);
    await act(async () => {
      worker.reply({
        type: "hoverResult",
        requestId: hover.requestId,
        id: camera.id,
        ids: [camera.id],
        footprints: [{ id: camera.id, ring: changed, approximate: true }],
      });
      await expect(pending!).resolves.toBe(camera);
    });
    expect(camera.footprint).toEqual(changed);
    view.unmount();
  });

  it("yields bounded footprint batches and reuses the worker as catalog shards arrive", async () => {
    vi.useFakeTimers();
    const view = setup();
    const catalog = new Map(
      Array.from({ length: 1300 }, (_, i) => [
        String(i),
        { ...record, id: String(i) },
      ])
    );
    view.rerender({ ...view.props, data: { ...data, imageRecords: catalog } });
    const worker = WorkerStub.instances[0];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    const parts = worker.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "init");
    expect(parts.map((message) => message.data.imageRecords.size)).toEqual([
      512, 512, 276,
    ]);
    expect(parts[2]).toMatchObject({ append: true, complete: true });
    expect(parts[0]).toMatchObject({ append: false, complete: false });
    expect(parts[2]).toMatchObject({ append: true, complete: true });
    view.rerender({ ...view.props, data: { ...data, imageRecords: catalog } });
    expect(WorkerStub.instances).toHaveLength(1);
    view.unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("queries hover without another viewport query, unprojection or records render", async () => {
    const view = setup();
    const worker = WorkerStub.instances[0];
    await flushCatalog();
    expect(worker.postMessage.mock.calls[0][0]).toMatchObject({
      type: "init",
      data: { imageRecords: new Map([[record.id, record]]) },
    });
    const viewport = worker.postMessage.mock.calls.find(
      ([message]) => message.type === "query"
    )![0];
    act(() => {
      worker.reply({
        type: "result",
        requestId: viewport.requestId,
        ids: [record.id, "disabled:foreign-image"],
      });
    });
    expect(view.result.current.records).toEqual([record]);
    const records = view.result.current.records;
    const renders = view.renders.mock.calls.length;
    const unprojections = vi.mocked(view.props.map.unproject).mock.calls.length;
    const queries = worker.postMessage.mock.calls.filter(
      ([message]) => message.type === "query"
    ).length;
    let pending: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint([7.006, 51.004]);
    });
    const hover = worker.postMessage.mock.lastCall![0];
    expect(hover).toMatchObject({
      type: "hover",
      query: { point: [7.006, 51.004], viewMode: "oblique" },
    });
    expect(hover.query.viewportCorners).toBe(viewport.query.corners);
    await act(async () => {
      worker.reply({
        type: "hoverResult",
        requestId: hover.requestId,
        id: record.id,
      });
      await expect(pending!).resolves.toBe(record);
    });
    expect(
      worker.postMessage.mock.calls.filter(
        ([message]) => message.type === "query"
      )
    ).toHaveLength(queries);
    expect(vi.mocked(view.props.map.unproject)).toHaveBeenCalledTimes(
      unprojections
    );
    expect(view.result.current.records).toBe(records);
    expect(view.renders).toHaveBeenCalledTimes(renders);
    view.unmount();
  });

  it("refreshes viewport records and cached hover corners after camera movement", async () => {
    const view = setup();
    const worker = WorkerStub.instances[0];
    await flushCatalog();
    const first = worker.postMessage.mock.calls.find(
      ([message]) => message.type === "query"
    )![0];
    vi.mocked(view.props.map.getBearing).mockReturnValue(90);
    view.props.map.transform.width = 200;
    act(() => view.listeners.get("moveend")?.());
    const viewport = worker.postMessage.mock.lastCall![0];
    expect(viewport).toMatchObject({
      type: "query",
      query: { center: [7.01, 51.005], headingRad: Math.PI / 2 },
    });
    expect(viewport.requestId).toBeGreaterThan(first.requestId);
    expect(viewport.query.corners).not.toEqual(first.query.corners);
    act(() =>
      worker.reply({
        type: "result",
        requestId: viewport.requestId,
        ids: [record.id],
      })
    );
    expect(view.result.current.records).toEqual([record]);
    const unprojections = vi.mocked(view.props.map.unproject).mock.calls.length;
    let pending: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint([7.006, 51.004]);
    });
    const hover = worker.postMessage.mock.lastCall![0];
    expect(hover.type).toBe("hover");
    expect(hover.query.headingRad).toBe(Math.PI / 2);
    expect(hover.query.viewportCorners).toBe(viewport.query.corners);
    expect(vi.mocked(view.props.map.unproject)).toHaveBeenCalledTimes(
      unprojections
    );
    await act(async () => {
      worker.reply({
        type: "hoverResult",
        requestId: hover.requestId,
        id: record.id,
      });
      await expect(pending!).resolves.toBe(record);
    });
    view.unmount();
  });

  it("keeps the worker alive and discards stale hover and viewport replies when the catalog changes", async () => {
    const view = setup();
    const worker = WorkerStub.instances[0];
    await flushCatalog();
    let pending: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint([7.006, 51.004]);
    });
    const hover = worker.postMessage.mock.lastCall![0];
    const viewport = worker.postMessage.mock.calls.find(
      ([message]) => message.type === "query"
    )![0];
    view.rerender({
      ...view.props,
      data: {
        imageRecords: new Map(),
        datasets: new Map(),
        centers: new Map(),
      },
    });
    await expect(pending!).resolves.toBeUndefined();
    expect(worker.terminate).not.toHaveBeenCalled();
    act(() => {
      worker.reply({
        type: "hoverResult",
        requestId: hover.requestId,
        id: record.id,
      });
      worker.reply({
        type: "result",
        requestId: viewport.requestId,
        ids: [record.id],
      });
    });
    expect(view.result.current.records).toEqual([]);
    view.unmount();
  });
});
