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
  mosaicSeriesId: string | null = null,
  prewarmEnabled = false
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
    triggerRepaint: vi.fn(),
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
    mosaicSeriesId,
    prewarmEnabled,
    catalogFilterKey: "",
    locked: false,
    viewMode: "oblique" as const,
  };
  return {
    ...renderHook<
      ReturnType<typeof useVisibleFootprints>,
      Parameters<typeof useVisibleFootprints>[0]
    >(
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
  it("publishes independent prewarm results, rejects stale replies and clears disabled or removed series", async () => {
    const view = setup(null, true);
    const other = { ...record, id: "other:photo", seriesId: "other" };
    const catalog = {
      ...data,
      imageRecords: new Map([
        [record.id, record],
        [other.id, other],
      ]),
      datasets: new Map([
        ...data.datasets,
        ["other", data.datasets.get("loaded")!],
      ]),
    };
    view.rerender({ ...view.props, data: catalog });
    await flushCatalog();
    const worker = WorkerStub.instances[0];
    const request = () =>
      worker.postMessage.mock.calls
        .map(([message]) => message)
        .findLast((message) => message.type === "prewarm");
    const first = request();
    expect(first).toBeDefined();
    act(() =>
      worker.reply({
        type: "prewarmResult",
        requestId: first.requestId,
        ids: [record.id, other.id],
      })
    );
    expect(view.result.current.prewarmRecords).toEqual([record, other]);
    expect(view.result.current.records).toEqual([]);
    const same = view.result.current.prewarmRecords;
    act(() =>
      worker.reply({
        type: "prewarmResult",
        requestId: first.requestId,
        ids: [record.id, other.id],
      })
    );
    expect(view.result.current.prewarmRecords).toBe(same);
    act(() =>
      worker.reply({
        type: "prewarmResult",
        requestId: first.requestId - 1,
        ids: [],
      })
    );
    expect(view.result.current.prewarmRecords).toBe(same);
    view.rerender({ ...view.props, data: catalog, prewarmEnabled: false });
    expect(view.result.current.prewarmRecords).toEqual([]);
    act(() =>
      worker.reply({
        type: "prewarmResult",
        requestId: first.requestId,
        ids: [record.id],
      })
    );
    expect(view.result.current.prewarmRecords).toEqual([]);
    view.rerender({ ...view.props, data: catalog, prewarmEnabled: true });
    const latest = request();
    act(() =>
      worker.reply({
        type: "prewarmResult",
        requestId: latest.requestId,
        ids: [record.id, other.id],
      })
    );
    expect(view.result.current.prewarmRecords).toEqual([record, other]);
    view.rerender({ ...view.props, data });
    expect(view.result.current.prewarmRecords).toEqual([]);
    act(() =>
      worker.reply({
        type: "prewarmResult",
        requestId: latest.requestId,
        ids: [other.id],
      })
    );
    expect(view.result.current.prewarmRecords).toEqual([]);
    expect(WorkerStub.instances).toHaveLength(1);
    view.unmount();
  });

  it("does not request uncapped candidates when prewarming is not enabled", async () => {
    const view = setup();
    await flushCatalog();
    expect(
      WorkerStub.instances[0].postMessage.mock.calls.some(
        ([message]) => message.type === "prewarm"
      )
    ).toBe(false);
    expect(view.result.current.prewarmRecords).toEqual([]);
    view.unmount();
  });

  it("keeps independent uncapped mosaic results and rejects stale series replies", async () => {
    const view = setup("loaded");
    const extra = { ...record, id: "other:image", seriesId: "other" };
    view.rerender({
      ...view.props,
      data: {
        ...data,
        imageRecords: new Map([
          [record.id, record],
          [extra.id, extra],
        ]),
      },
    });
    await flushCatalog();
    const worker = WorkerStub.instances[0];
    const mosaic = worker.postMessage.mock.calls
      .map(([message]) => message)
      .findLast((message) => message.type === "mosaic");
    expect(mosaic.seriesId).toBe("loaded");
    act(() =>
      worker.reply({
        type: "mosaicResult",
        requestId: mosaic.requestId,
        seriesId: "loaded",
        ids: [record.id, extra.id],
      })
    );
    expect(view.result.current.mosaicRecords).toEqual([record]);
    expect(view.result.current.records).toEqual([]);
    act(() =>
      worker.reply({
        type: "result",
        requestId: mosaic.requestId,
        ids: [record.id],
      })
    );
    expect(view.result.current.records).toEqual([record]);
    view.rerender({
      ...view.props,
      mosaicSeriesId: "other",
      data: {
        ...data,
        imageRecords: new Map([
          [record.id, record],
          [extra.id, extra],
        ]),
      },
    });
    expect(view.result.current.mosaicRecords).toEqual([]);
    const next = worker.postMessage.mock.calls
      .map(([message]) => message)
      .findLast((message) => message.type === "mosaic");
    expect(next.seriesId).toBe("other");
    act(() =>
      worker.reply({
        type: "mosaicResult",
        requestId: next.requestId,
        seriesId: "loaded",
        ids: [record.id],
      })
    );
    expect(view.result.current.mosaicRecords).toEqual([]);
    act(() =>
      worker.reply({
        type: "mosaicResult",
        requestId: mosaic.requestId,
        seriesId: "other",
        ids: [extra.id],
      })
    );
    expect(view.result.current.mosaicRecords).toEqual([]);
    act(() =>
      worker.reply({
        type: "mosaicResult",
        requestId: next.requestId,
        seriesId: "other",
        ids: [extra.id, record.id],
      })
    );
    expect(view.result.current.mosaicRecords).toEqual([extra]);
    view.unmount();
  });

  it.each([false, true])(
    "ranks eligible hover IDs by actual cursor pixels while preserving heading-first=%s",
    async (headingFirst) => {
      const view = setup();
      const closer = {
        ...record,
        id: "loaded:screen-near",
        pose: { bearingDeg: headingFirst ? 90 : 0 },
      } as ObliqueImageRecord;
      const foreign = { ...record, id: "loaded:not-returned" };
      const catalog = {
        ...data,
        imageRecords: new Map([
          [record.id, record],
          [closer.id, closer],
          [foreign.id, foreign],
        ]),
        centers: new Map([
          [record.id, { longitude: 7.006, latitude: 51.004 }],
          [closer.id, { longitude: 7.008, latitude: 51.008 }],
          [foreign.id, { longitude: 7.009, latitude: 51.009 }],
        ]),
      } as ObliqueSelectionData;
      view.props.map.project = vi.fn((point: any) =>
        point[0] === 7.006
          ? { x: 80, y: 80 }
          : point[0] === 7.008
          ? { x: 11, y: 10 }
          : { x: 10, y: 10 }
      ) as any;
      view.rerender({ ...view.props, data: catalog });
      await flushCatalog();
      const worker = WorkerStub.instances[0];
      let pending: Promise<ObliqueImageRecord | null | undefined>;
      act(() => {
        pending = view.result.current.findAtGroundPoint(
          [7.006, 51.004],
          null,
          100,
          { x: 10, y: 10 } as never
        );
      });
      const query = worker.postMessage.mock.lastCall![0];
      await act(async () => {
        worker.reply({
          type: "hoverResult",
          requestId: query.requestId,
          id: record.id,
          ids: [record.id, closer.id],
          headingFirst,
        });
        await expect(pending!).resolves.toBe(headingFirst ? record : closer);
      });
      expect(view.props.map.project).not.toHaveBeenCalledWith([7.009, 51.009]);
      view.unmount();
    }
  );

  it("passes every returned hydrated candidate to the NG picker without map-centre reranking", async () => {
    const view = setup();
    const candidates = Array.from({ length: 17 }, (_, i) => ({
      ...record,
      id: `candidate-${i}`,
      footprint: undefined,
    }));
    const excluded = { ...record, id: "not-returned" };
    const catalog = {
      ...data,
      imageRecords: new Map(
        [...candidates, excluded].map((item) => [item.id, item])
      ),
    };
    const picker = vi.fn(
      async (records, query, headingFirst, isCurrent, screenPoint) => {
        expect(records).toEqual(candidates);
        expect(records[16].footprint).toEqual(record.footprint);
        expect(query.uncappedHoverCandidates).toBe(true);
        expect(headingFirst).toBe(true);
        expect(isCurrent()).toBe(true);
        expect(screenPoint).toEqual({ x: 10, y: 12 });
        return records[16];
      }
    );
    view.props.map.project = vi.fn(() => ({ x: 0, y: 0 })) as never;
    view.rerender({
      ...view.props,
      data: catalog,
      uncappedHoverCandidates: true,
      pickHoverCandidates: picker,
    });
    await flushCatalog();
    const worker = WorkerStub.instances[0];
    const before = worker.postMessage.mock.calls.length;
    const pending = view.result.current.findAtGroundPoint(
      [7.006, 51.004],
      null,
      100,
      { x: 10, y: 12 } as never
    );
    const message = worker.postMessage.mock.lastCall![0];
    const response = {
      type: "hoverResult",
      requestId: message.requestId,
      id: candidates[0].id,
      ids: [...candidates.map(({ id }) => id), "missing"],
      headingFirst: true,
      footprints: [{ id: candidates[16].id, ring: record.footprint }],
    };
    await act(async () => {
      worker.reply(response);
      worker.reply(response);
      await expect(pending).resolves.toBe(candidates[16]);
    });
    expect(picker).toHaveBeenCalledOnce();
    expect(view.props.map.project).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledTimes(before + 1);
    view.unmount();
  });

  it("exposes the latest picker pool through a stable getter and repaints only changed IDs", async () => {
    const view = setup();
    const other = { ...record, id: "other" };
    const catalog = {
      ...data,
      imageRecords: new Map([
        [record.id, record],
        [other.id, other],
      ]),
    };
    const picker = vi.fn(async (records) => records[0] ?? null);
    const props = { ...view.props, data: catalog, pickHoverCandidates: picker };
    view.rerender(props);
    await flushCatalog();
    const read = view.result.current.readHoverCandidates;
    const worker = WorkerStub.instances[0];
    const requests = worker.postMessage.mock.calls.length;
    const renders = view.renders.mock.calls.length;
    const run = async (ids: string[]) => {
      const pending = view.result.current.findAtGroundPoint(
        [7.006, 51.004],
        null,
        100,
        { x: 10, y: 12 } as never
      );
      await act(async () => {
        worker.reply({
          type: "hoverResult",
          requestId: worker.postMessage.mock.lastCall![0].requestId,
          ids,
        });
        await pending;
      });
    };
    await run([record.id, other.id]);
    expect(read()).toEqual([record, other]);
    expect(view.props.map.triggerRepaint).toHaveBeenCalledTimes(1);
    const first = read();
    await run([record.id, other.id]);
    expect(read()).toBe(first);
    expect(view.props.map.triggerRepaint).toHaveBeenCalledTimes(1);
    await run([other.id]);
    expect(read()).toEqual([other]);
    expect(view.props.map.triggerRepaint).toHaveBeenCalledTimes(2);
    expect(view.result.current.readHoverCandidates).toBe(read);
    expect(view.renders).toHaveBeenCalledTimes(renders);
    expect(worker.postMessage).toHaveBeenCalledTimes(requests + 3);
    view.rerender({ ...props, data: { ...catalog, imageRecords: new Map() } });
    expect(read()).toEqual([]);
    expect(view.props.map.triggerRepaint).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(read()).toEqual([]);
    expect(view.props.map.triggerRepaint).toHaveBeenCalledTimes(3);
  });

  it.each(["disabled", "null catalog", "unmounted"])(
    "clears the debug picker pool when %s",
    async (reason) => {
      const view = setup();
      const props = {
        ...view.props,
        pickHoverCandidates: vi.fn(async () => record),
      };
      view.rerender(props);
      await flushCatalog();
      const read = view.result.current.readHoverCandidates;
      const worker = WorkerStub.instances[0];
      const pending = view.result.current.findAtGroundPoint(
        [7.006, 51.004],
        null,
        100,
        { x: 10, y: 12 } as never
      );
      await act(async () => {
        worker.reply({
          type: "hoverResult",
          requestId: worker.postMessage.mock.lastCall![0].requestId,
          ids: [record.id],
        });
        await pending;
      });
      expect(read()).toEqual([record]);
      if (reason === "unmounted") view.unmount();
      else
        view.rerender({
          ...props,
          ...(reason === "disabled" ? { enabled: false } : { data: null }),
        });
      expect(read()).toEqual([]);
      expect(view.props.map.triggerRepaint).toHaveBeenCalledTimes(2);
      if (reason !== "unmounted") view.unmount();
    }
  );

  it("coalesces pointer requests during async picking and discards the previous winner", async () => {
    const view = setup();
    let release!: (record: ObliqueImageRecord) => void;
    let isCurrent!: () => boolean;
    const picker = vi.fn((_records, _query, _heading, current) => {
      isCurrent = current;
      return new Promise<ObliqueImageRecord>((resolve) => {
        release = resolve;
      });
    });
    view.rerender({ ...view.props, pickHoverCandidates: picker });
    await flushCatalog();
    const worker = WorkerStub.instances[0];
    const request = () =>
      view.result.current.findAtGroundPoint([7.006, 51.004], null, 100, {
        x: 10,
        y: 12,
      } as never);
    const first = request();
    const firstMessage = worker.postMessage.mock.lastCall![0];
    await act(async () => {
      worker.reply({
        type: "hoverResult",
        requestId: firstMessage.requestId,
        ids: [record.id],
      });
      await Promise.resolve();
    });
    expect(isCurrent()).toBe(true);
    const middle = request(),
      last = request();
    await expect(middle).resolves.toBeUndefined();
    expect(isCurrent()).toBe(false);
    expect(worker.postMessage.mock.lastCall![0]).toBe(firstMessage);
    picker.mockImplementation(async () => record);
    await act(async () => {
      release(record);
      await expect(first).resolves.toBeUndefined();
    });
    const lastMessage = worker.postMessage.mock.lastCall![0];
    expect(lastMessage.requestId).toBe(firstMessage.requestId + 2);
    await act(async () => {
      worker.reply({
        type: "hoverResult",
        requestId: firstMessage.requestId,
        ids: [record.id],
      });
      worker.reply({
        type: "hoverResult",
        requestId: lastMessage.requestId,
        ids: [record.id],
      });
      await expect(last).resolves.toBe(record);
    });
    expect(picker).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it.each(["locked", "disabled", "unmounted"])(
    "cancels an asynchronous picker when %s",
    async (reason) => {
      const view = setup();
      let release!: (record: ObliqueImageRecord) => void;
      let isCurrent!: () => boolean;
      const picker = vi.fn((_records, _query, _heading, current) => {
        isCurrent = current;
        return new Promise<ObliqueImageRecord>((resolve) => {
          release = resolve;
        });
      });
      const props = { ...view.props, pickHoverCandidates: picker };
      view.rerender(props);
      await flushCatalog();
      const worker = WorkerStub.instances[0];
      const pending = view.result.current.findAtGroundPoint(
        [7.006, 51.004],
        null,
        100,
        { x: 10, y: 12 } as never
      );
      await act(async () => {
        worker.reply({
          type: "hoverResult",
          requestId: worker.postMessage.mock.lastCall![0].requestId,
          ids: [record.id],
        });
        await Promise.resolve();
      });
      if (reason === "unmounted") view.unmount();
      else
        view.rerender({
          ...props,
          ...(reason === "locked" ? { locked: true } : { enabled: false }),
        });
      expect(isCurrent()).toBe(false);
      await expect(pending).resolves.toBeUndefined();
      const messages = worker.postMessage.mock.calls.length;
      await act(async () => {
        release(record);
        await Promise.resolve();
      });
      expect(worker.postMessage).toHaveBeenCalledTimes(messages);
      if (reason !== "unmounted") view.unmount();
    }
  );

  it.each(["throw", "reject", "worker"])(
    "settles picker/worker %s errors without publishing a winner",
    async (failure) => {
      const view = setup();
      const picker = vi.fn(() => {
        if (failure === "throw") throw new Error("pick failed");
        return Promise.reject(new Error("pick failed"));
      });
      view.rerender({ ...view.props, pickHoverCandidates: picker });
      await flushCatalog();
      const worker = WorkerStub.instances[0];
      const pending = view.result.current.findAtGroundPoint(
        [7.006, 51.004],
        null,
        100,
        { x: 10, y: 12 } as never
      );
      await act(async () => {
        worker.reply({
          type: failure === "worker" ? "error" : "hoverResult",
          requestType: "hover",
          requestId: worker.postMessage.mock.lastCall![0].requestId,
          ids: [record.id],
        });
        await expect(pending).resolves.toBeUndefined();
      });
      expect(picker).toHaveBeenCalledTimes(failure === "worker" ? 0 : 1);
      view.unmount();
    }
  );

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

  it("resets the worker for an equally sized filtered record set and rejects old results", async () => {
    const view = setup();
    await flushCatalog();
    const worker = WorkerStub.instances[0];
    const oldViewport = worker.postMessage.mock.calls.find(
      ([message]) => message.type === "query"
    )![0];
    act(() =>
      worker.reply({
        type: "result",
        requestId: oldViewport.requestId,
        ids: [record.id],
      })
    );
    expect(view.result.current.records).toEqual([record]);
    const replacement = { ...record, id: "loaded:filtered-replacement" };
    const sentBefore = worker.postMessage.mock.calls.length;
    view.rerender({
      ...view.props,
      catalogFilterKey: "camera:replacement",
      data: { ...data, imageRecords: new Map([[replacement.id, replacement]]) },
    });
    await flushCatalog();
    const newMessages = worker.postMessage.mock.calls
      .slice(sentBefore)
      .map(([message]) => message);
    const init = newMessages.find((message) => message.type === "init");
    expect(init).toMatchObject({ append: false, complete: true });
    expect([...init.data.imageRecords.keys()]).toEqual([replacement.id]);
    expect(view.result.current.records).toEqual([]);
    act(() =>
      worker.reply({
        type: "result",
        requestId: oldViewport.requestId,
        ids: [record.id],
      })
    );
    expect(view.result.current.records).toEqual([]);
    const freshQuery = worker.postMessage.mock.calls
      .map(([message]) => message)
      .findLast((message) => message.type === "query");
    expect(freshQuery.requestId).not.toBe(oldViewport.requestId);
    act(() =>
      worker.reply({
        type: "result",
        requestId: freshQuery.requestId,
        ids: [replacement.id, record.id],
      })
    );
    expect(view.result.current.records).toEqual([replacement]);
    expect(WorkerStub.instances).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();
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
