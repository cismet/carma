import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ObliqueSelectionData,
  ObliqueImageRecord,
} from "../../core/types";
import { degToRad, type Degrees } from "@carma-units";
const mocks = vi.hoisted(() => ({
  spatial: vi.fn(),
  estimate: vi.fn(),
  near: [] as string[],
}));
vi.mock("../../core/utils/image-selection-index", () => ({
  createImageSelectionIndex: mocks.spatial,
}));
vi.mock("../../core/utils/selection", () => ({
  estimateGroundFootprint: mocks.estimate,
}));
const ring = (lng = 7.2) => [
  [lng - 0.001, 51.269],
  [lng + 0.001, 51.269],
  [lng + 0.001, 51.271],
  [lng - 0.001, 51.271],
  [lng - 0.001, 51.269],
];
const record = (id: string, east = false) =>
  ({
    id,
    sourceId: id,
    seriesId: "series",
    cameraId: "camera",
    sector: east ? 1 : 0,
    pose: { bearingDeg: east ? 90 : 0 },
    fallbackHeading: degToRad((east ? 90 : 0) as Degrees),
  } as ObliqueImageRecord);
const data = (
  records: ObliqueImageRecord[],
  centers: ObliqueSelectionData["centers"] = new Map()
): ObliqueSelectionData => ({
  imageRecords: new Map(records.map((r) => [r.id, r])),
  centers,
  datasets: new Map([
    ["series", { maxDistanceMeters: 1000, cameras: { camera: {} } } as never],
  ]),
});
const query = {
  corners: ring(),
  center: [7.2, 51.27],
  headingRad: degToRad(0 as Degrees),
  viewMode: "oblique",
};
const setup = async () => {
  vi.resetModules();
  const scope = {
    onmessage: null as null | ((event: MessageEvent) => void),
    postMessage: vi.fn(),
  };
  vi.stubGlobal("self", scope);
  mocks.near = [];
  mocks.estimate.mockImplementation(() => ring());
  mocks.spatial.mockImplementation(() => {
    const indexed = new Map<string, ObliqueImageRecord>();
    const append = vi.fn((part: ObliqueSelectionData) => {
      for (const [id, record] of part.imageRecords) indexed.set(id, record);
    });
    return {
      append,
      candidates: function* (
        query: { enabledSeriesIds?: string[] },
        options: { allDirections?: boolean; limitPerDirection?: number } = {}
      ) {
        yield* [...indexed.values()]
          .filter(
            (r) =>
              (!query.enabledSeriesIds ||
                query.enabledSeriesIds.includes(r.seriesId)) &&
              (!mocks.near.length || mocks.near.includes(r.id)) &&
              (options.allDirections || r.sector === 0)
          )
          .slice(0, options.limitPerDirection);
      },
    };
  });
  await import("./viewport-footprints.worker");
  return {
    scope,
    send: (value: object) => scope.onmessage?.({ data: value } as MessageEvent),
  };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("spatially shortlisted lazy footprint worker", () => {
  it("prewarms every overlapping current-direction photo across series without changing visual limits", async () => {
    const { scope, send } = await setup();
    const first = Array.from({ length: 80 }, (_, i) => record(`first-${i}`));
    const second = Array.from({ length: 75 }, (_, i) => ({
      ...record(`second-${i}`),
      seriesId: "other",
    }));
    const sideways = { ...record("sideways", true), footprint: ring() };
    const outside = {
      ...record("outside"),
      footprint: ring(8.2),
      footprintApproximate: false,
    };
    const catalog = data([...first, ...second, sideways, outside]);
    catalog.datasets.set("other", catalog.datasets.get("series")!);
    await send({ type: "init", data: catalog });
    await send({ type: "prewarm", requestId: 81, query });
    const result = scope.postMessage.mock.lastCall![0];
    expect(result.type).toBe("prewarmResult");
    expect(result.requestId).toBe(81);
    expect(new Set(result.ids)).toEqual(
      new Set([...first, ...second].map((entry) => entry.id))
    );
    expect(result.ids).toHaveLength(155);
    expect(result.footprints).toBeUndefined();
    await send({ type: "query", requestId: 82, query });
    expect(scope.postMessage.mock.lastCall![0].ids.length).toBeLessThanOrEqual(
      16
    );
    expect(mocks.spatial).toHaveBeenCalledOnce();
  });

  it("returns uncapped mosaic overlap from exactly one series and cardinal sector while retaining the hover limit", async () => {
    const { scope, send } = await setup();
    const own = Array.from({ length: 90 }, (_, i) => record(`own-${i}`));
    const foreign = Array.from({ length: 100 }, (_, i) => ({
      ...record(`foreign-${i}`),
      seriesId: "other",
    }));
    await send({
      type: "init",
      data: data([...foreign, ...own, record("east", true)]),
    });
    await send({ type: "mosaic", requestId: 71, seriesId: "series", query });
    const result = scope.postMessage.mock.lastCall![0];
    expect(result.type).toBe("mosaicResult");
    expect(result.seriesId).toBe("series");
    expect(result.ids).toHaveLength(90);
    expect(new Set(result.ids)).toEqual(new Set(own.map((entry) => entry.id)));
    expect(mocks.estimate).toHaveBeenCalledTimes(90);
    await send({ type: "query", requestId: 72, query });
    expect(scope.postMessage.mock.lastCall![0].type).toBe("result");
    expect(scope.postMessage.mock.lastCall![0].ids.length).toBeLessThanOrEqual(
      16
    );
  });

  it("fills one persistent spatial index per catalog shard and derives no catalog rings at initialization", async () => {
    const { scope, send } = await setup();
    await send({ type: "init", data: data([record("a")]), complete: false });
    expect(mocks.spatial).toHaveBeenCalledOnce();
    expect(mocks.estimate).not.toHaveBeenCalled();
    expect(scope.postMessage).not.toHaveBeenCalled();
    await send({
      type: "init",
      data: data([record("b")]),
      append: true,
      complete: true,
    });
    expect(mocks.spatial).toHaveBeenCalledOnce();
    expect(mocks.spatial.mock.results[0].value.append).toHaveBeenCalledTimes(2);
    expect([
      ...mocks.spatial.mock.results[0].value.append.mock.calls[0][0].imageRecords.keys(),
    ]).toEqual(["a"]);
    expect([
      ...mocks.spatial.mock.results[0].value.append.mock.calls[1][0].imageRecords.keys(),
    ]).toEqual(["b"]);
    expect(mocks.spatial.mock.calls[0][1]).toEqual({ groundCenters: true });
    expect(mocks.estimate).not.toHaveBeenCalled();
    expect(scope.postMessage).toHaveBeenCalledWith({ type: "ready" });
  });
  it("derives only sixteen nearby rings per direction and reuses them", async () => {
    const { scope, send } = await setup();
    await send({
      type: "init",
      data: data(Array.from({ length: 4096 }, (_, i) => record(String(i)))),
    });
    await send({ type: "query", requestId: 1, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(16);
    expect(scope.postMessage.mock.lastCall![0].ids).toHaveLength(16);
    expect(scope.postMessage.mock.lastCall![0].footprints).toHaveLength(16);
    await send({
      type: "hover",
      requestId: 2,
      query: {
        point: query.center,
        viewportCorners: query.corners,
        headingRad: query.headingRad,
        viewMode: query.viewMode,
      },
    });
    expect(scope.postMessage.mock.lastCall![0].ids).toHaveLength(16);
    expect(mocks.estimate).toHaveBeenCalledTimes(16);
  });
  it("includes the seventeenth local overlap for NG while keeping Classic and display bounded", async () => {
    const { scope, send } = await setup();
    const local = Array.from({ length: 17 }, (_, i) => record(`local-${i}`));
    const distant = record("distant");
    mocks.near = local.map(({ id }) => id);
    mocks.estimate.mockImplementation((record) =>
      record.id === "local-16" ? ring() : ring(7.1985)
    );
    await send({ type: "init", data: data([...local, distant]) });
    const pointQuery = {
      point: query.center,
      viewportCorners: query.corners,
      headingRad: query.headingRad,
      viewMode: query.viewMode,
    };
    await send({ type: "hover", requestId: 1, query: pointQuery });
    expect(scope.postMessage.mock.lastCall![0].ids).toHaveLength(16);
    expect(scope.postMessage.mock.lastCall![0].ids).not.toContain("local-16");
    await send({
      type: "hover",
      requestId: 2,
      query: { ...pointQuery, uncappedHoverCandidates: true },
    });
    expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
      id: "local-16",
      headingFirst: false,
    });
    expect(scope.postMessage.mock.lastCall![0].ids).toHaveLength(17);
    expect(scope.postMessage.mock.lastCall![0].ids).toContain("local-0");
    expect(mocks.estimate).toHaveBeenCalledTimes(17);
    expect(
      mocks.estimate.mock.calls.some(([record]) => record.id === "distant")
    ).toBe(false);
    await send({ type: "query", requestId: 3, query });
    expect(scope.postMessage.mock.lastCall![0].ids).toHaveLength(16);
    await send({ type: "hover", requestId: 4, query: pointQuery });
    expect(scope.postMessage.mock.lastCall![0].ids).toHaveLength(16);
  });
  it("invalidates only corrected row/center derivatives while retaining unchanged shard geometry", async () => {
    const { scope, send } = await setup();
    const a = record("a"),
      b = record("b");
    const center = (id: string, longitude: number) => ({
      id,
      x: 0,
      y: 0,
      longitude,
      latitude: 51.27,
      cardinal: "N" as const,
    });
    await send({
      type: "init",
      data: data(
        [a, b],
        new Map([
          [a.id, center(a.id, 7.2)],
          [b.id, center(b.id, 7.2)],
        ])
      ),
    });
    await send({ type: "query", requestId: 1, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(2);
    await send({
      type: "init",
      append: true,
      data: data(
        [
          { ...a, pose: { ...a.pose! } },
          { ...b, pose: { ...b.pose! } },
        ],
        new Map([
          [a.id, { ...center(a.id, 7.2) }],
          [b.id, { ...center(b.id, 7.2) }],
        ])
      ),
    });
    await send({ type: "query", requestId: 2, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(2);
    await send({
      type: "init",
      append: true,
      data: {
        imageRecords: new Map(),
        datasets: new Map(),
        centers: new Map([[a.id, center(a.id, 7.2002)]]),
      },
    });
    await send({ type: "query", requestId: 3, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(3);
    expect(
      scope.postMessage.mock.lastCall![0].footprints.find(
        (value: { id: string }) => value.id === a.id
      ).groundCenter
    ).toEqual([7.2002, 51.27]);
    await send({
      type: "init",
      append: true,
      data: data([{ ...b, pose: { ...b.pose!, bearingDeg: 10 } }]),
    });
    await send({ type: "query", requestId: 4, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(4);
    expect(mocks.spatial).toHaveBeenCalledOnce();
  });
  it("derives other directions only when the preferred direction has no actual hit", async () => {
    const { scope, send } = await setup();
    const north = record("north"),
      east = record("east", true);
    mocks.estimate.mockImplementation((r: ObliqueImageRecord) =>
      ring(r.id === "north" ? 8 : 7.2)
    );
    await send({ type: "init", data: data([north, east]) });
    await send({
      type: "hover",
      requestId: 1,
      query: {
        point: query.center,
        viewportCorners: query.corners,
        headingRad: query.headingRad,
        viewMode: query.viewMode,
      },
    });
    expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
      id: east.id,
      headingFirst: true,
    });
    expect(mocks.estimate).toHaveBeenCalledTimes(2);
    await send({ type: "init", data: data([north, east]) });
    mocks.estimate.mockClear();
    mocks.estimate.mockImplementation(() => ring());
    await send({
      type: "hover",
      requestId: 2,
      query: {
        point: query.center,
        viewportCorners: query.corners,
        headingRad: query.headingRad,
        viewMode: query.viewMode,
      },
    });
    expect(mocks.estimate).toHaveBeenCalledOnce();
    expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
      id: north.id,
      headingFirst: false,
    });
  });
  it("evicts approximation geometry beyond512 while keeping the full metadata index", async () => {
    const { send } = await setup();
    await send({
      type: "init",
      data: data(Array.from({ length: 768 }, (_, i) => record(String(i)))),
    });
    for (let start = 0; start < 768; start += 16) {
      mocks.near = Array.from({ length: 16 }, (_, i) => String(start + i));
      await send({ type: "query", requestId: start + 1, query });
    }
    expect(mocks.estimate).toHaveBeenCalledTimes(768);
    mocks.near = Array.from({ length: 16 }, (_, i) => String(i));
    await send({ type: "query", requestId: 1000, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(784);
    expect(mocks.spatial).toHaveBeenCalledOnce();
  });
});
