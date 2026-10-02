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
const setup = () => {
  const map = {
    transform: { width: 100, height: 100, centerOffset: { x: 0, y: 0 } },
    unproject: ([x, y]: [number, number]) => ({
      lng: 7 + x / 10000,
      lat: 51 + y / 10000,
    }),
    getCenter: () => ({ lng: 7.005, lat: 51.005 }),
    getBearing: () => 0,
    getPitch: () => 45,
    getZoom: () => 17,
    getVerticalFieldOfView: () => 36,
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MaplibreMap;
  const props = {
    map,
    data,
    enabled: true,
    locked: false,
    viewMode: "oblique" as const,
  };
  return {
    ...renderHook(useVisibleFootprints, { initialProps: props }),
    props,
  };
};

beforeEach(() => {
  WorkerStub.instances = [];
  vi.stubGlobal("Worker", WorkerStub);
});
afterEach(() => vi.unstubAllGlobals());

describe("pointer-driven footprint viewport queries", () => {
  it("uses the cursor for both hover selection and sector display within the loaded catalog", async () => {
    const view = setup();
    const worker = WorkerStub.instances[0];
    const initial = worker.postMessage.mock.calls[0][0];
    expect(initial).toMatchObject({
      type: "init",
      catalog: [{ id: record.id, headingRad: 0, nadir: false }],
    });
    let pending: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint([7.006, 51.004]);
    });
    const [hover, viewport] = worker.postMessage.mock.calls
      .slice(-2)
      .map(([message]) => message);
    expect(hover).toMatchObject({
      type: "hover",
      query: { point: [7.006, 51.004], viewMode: "oblique" },
    });
    expect(viewport).toMatchObject({
      type: "query",
      query: {
        point: [7.006, 51.004],
        corners: hover.query.viewportCorners,
        headingRad: hover.query.headingRad,
      },
    });
    await act(async () => {
      worker.reply({
        type: "hoverResult",
        requestId: hover.requestId,
        id: record.id,
      });
      await expect(pending!).resolves.toBe(record);
      worker.reply({
        type: "result",
        requestId: viewport.requestId,
        ids: [record.id, "disabled:foreign-image"],
      });
    });
    expect(view.result.current.records).toEqual([record]);
    view.unmount();
  });

  it("discards pending hover and viewport replies when the loaded catalog changes", async () => {
    const view = setup();
    const worker = WorkerStub.instances[0];
    let pending: Promise<ObliqueImageRecord | null | undefined>;
    act(() => {
      pending = view.result.current.findAtGroundPoint([7.006, 51.004]);
    });
    const [hover, viewport] = worker.postMessage.mock.calls
      .slice(-2)
      .map(([message]) => message);
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
