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
  refineAtGroundPoint?: Parameters<
    typeof useVisibleFootprints
  >[0]["refineAtGroundPoint"]
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
    refineAtGroundPoint,
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

beforeEach(() => {
  WorkerStub.instances = [];
  vi.stubGlobal("Worker", WorkerStub);
});
afterEach(() => vi.unstubAllGlobals());

describe("pointer-driven footprint viewport queries", () => {
  it("queries hover without another viewport query, unprojection or records render", async () => {
    const view = setup();
    const worker = WorkerStub.instances[0];
    expect(worker.postMessage.mock.calls[0][0]).toMatchObject({
      type: "init",
      catalog: [{ id: record.id, headingRad: 0, nadir: false }],
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

  it("discards pending hover and viewport replies when the loaded catalog changes", async () => {
    const view = setup();
    const worker = WorkerStub.instances[0];
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
    expect(worker.terminate).toHaveBeenCalledOnce();
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

describe("physical photo-axis refinement", () => {
  it("passes every loaded worker candidate and heading policy without rendering new records", async () => {
    const other = { ...record, id: "loaded:other" };
    let resolve!: (value: ObliqueImageRecord | null | undefined) => void;
    const refine = vi.fn<
      NonNullable<
        Parameters<typeof useVisibleFootprints>[0]["refineAtGroundPoint"]
      >
    >(
      () =>
        new Promise<ObliqueImageRecord | null | undefined>((done) => {
          resolve = done;
        })
    );
    const view = setup(refine);
    view.rerender({
      ...view.props,
      data: {
        ...data,
        imageRecords: new Map([
          [record.id, record],
          [other.id, other],
        ]),
      },
    });
    const worker = WorkerStub.instances.at(-1)!;
    const renders = view.renders.mock.calls.length;
    const currentRecords = view.result.current.records;
    let pending!: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint(
        [7.006, 51.004],
        record.id
      );
    });
    const request = worker.postMessage.mock.lastCall![0];
    act(() =>
      worker.reply({
        type: "hoverResult",
        requestId: request.requestId,
        ids: [record.id, other.id, "not-loaded"],
        headingFirst: true,
      })
    );
    expect(refine).toHaveBeenCalledOnce();
    expect(refine.mock.calls[0][0]).toEqual([record, other]);
    expect(refine.mock.calls[0][1]).toBe(request.query);
    expect(refine.mock.calls[0][2]).toBe(true);
    expect(refine.mock.calls[0][3]()).toBe(true);
    await act(async () => {
      resolve(other);
      await expect(pending).resolves.toBe(other);
    });
    expect(view.result.current.records).toBe(currentRecords);
    expect(view.renders).toHaveBeenCalledTimes(renders);
    view.unmount();
  });

  it("marks in-flight refinement obsolete and starts only the latest queued pointer query", async () => {
    let resolveFirst!: (value: ObliqueImageRecord | null | undefined) => void;
    const refine = vi
      .fn<
        NonNullable<
          Parameters<typeof useVisibleFootprints>[0]["refineAtGroundPoint"]
        >
      >()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveFirst = done;
          })
      )
      .mockResolvedValue(record);
    const view = setup(refine);
    const worker = WorkerStub.instances[0];
    let first!: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      first = view.result.current.findAtGroundPoint([7.002, 51.003]);
    });
    const firstRequest = worker.postMessage.mock.lastCall![0];
    act(() =>
      worker.reply({
        type: "hoverResult",
        requestId: firstRequest.requestId,
        ids: [record.id],
        headingFirst: false,
      })
    );
    const isCurrent = refine.mock.calls[0][3];
    expect(isCurrent()).toBe(true);
    let superseded!: Promise<ObliqueImageRecord | null | undefined>;
    let latest!: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      superseded = view.result.current.findAtGroundPoint([7.003, 51.004]);
      latest = view.result.current.findAtGroundPoint([7.004, 51.005]);
    });
    await expect(superseded).resolves.toBeUndefined();
    expect(isCurrent()).toBe(false);
    await act(async () => {
      resolveFirst(undefined);
      await expect(first).resolves.toBeUndefined();
    });
    const latestRequest = worker.postMessage.mock.lastCall![0];
    expect(latestRequest.query.point).toEqual([7.004, 51.005]);
    expect(
      worker.postMessage.mock.calls.filter(
        ([message]) => message.type === "hover"
      )
    ).toHaveLength(2);
    act(() =>
      worker.reply({
        type: "hoverResult",
        requestId: firstRequest.requestId,
        ids: [record.id],
      })
    );
    expect(refine).toHaveBeenCalledTimes(1);
    await act(async () => {
      worker.reply({
        type: "hoverResult",
        requestId: latestRequest.requestId,
        ids: [record.id],
        headingFirst: false,
      });
      await expect(latest).resolves.toBe(record);
    });
    expect(refine).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("cancels asynchronous refinement when preview locks the view", async () => {
    let resolve!: (value: ObliqueImageRecord | null | undefined) => void;
    const refine = vi.fn<
      NonNullable<
        Parameters<typeof useVisibleFootprints>[0]["refineAtGroundPoint"]
      >
    >(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = setup(refine);
    const worker = WorkerStub.instances[0];
    let pending!: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint([7.002, 51.003]);
    });
    const request = worker.postMessage.mock.lastCall![0];
    act(() =>
      worker.reply({
        type: "hoverResult",
        requestId: request.requestId,
        ids: [record.id],
      })
    );
    const isCurrent = refine.mock.calls[0][3];
    view.rerender({ ...view.props, locked: true });
    expect(isCurrent()).toBe(false);
    await expect(pending).resolves.toBeUndefined();
    await act(async () => {
      resolve(record);
      await Promise.resolve();
    });
    expect(view.result.current.records).toEqual([]);
    view.unmount();
  });
});
