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
    sector: east ? "E" : "N",
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
      candidates: (
        _query: unknown,
        options: { allDirections?: boolean; limitPerDirection?: number }
      ) =>
        [...indexed.values()]
          .filter(
            (r) =>
              (!mocks.near.length || mocks.near.includes(r.id)) &&
              (options.allDirections || r.sector === "N")
          )
          .slice(0, options.limitPerDirection),
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
  it("fills one persistent spatial index per catalog shard and derives no catalog rings at initialization", async () => {
    const { scope, send } = await setup();
    send({ type: "init", data: data([record("a")]), complete: false });
    expect(mocks.spatial).toHaveBeenCalledOnce();
    expect(mocks.estimate).not.toHaveBeenCalled();
    expect(scope.postMessage).not.toHaveBeenCalled();
    send({
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
    send({
      type: "init",
      data: data(Array.from({ length: 4096 }, (_, i) => record(String(i)))),
    });
    send({ type: "query", requestId: 1, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(16);
    expect(scope.postMessage.mock.lastCall![0].ids).toHaveLength(16);
    expect(scope.postMessage.mock.lastCall![0].footprints).toHaveLength(16);
    send({
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
  it("derives other directions only when the preferred direction has no actual hit", async () => {
    const { scope, send } = await setup();
    const north = record("north"),
      east = record("east", true);
    mocks.estimate.mockImplementation((r: ObliqueImageRecord) =>
      ring(r.id === "north" ? 8 : 7.2)
    );
    send({ type: "init", data: data([north, east]) });
    send({
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
    send({ type: "init", data: data([north, east]) });
    mocks.estimate.mockClear();
    mocks.estimate.mockImplementation(() => ring());
    send({
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
    send({
      type: "init",
      data: data(Array.from({ length: 768 }, (_, i) => record(String(i)))),
    });
    for (let start = 0; start < 768; start += 16) {
      mocks.near = Array.from({ length: 16 }, (_, i) => String(start + i));
      send({ type: "query", requestId: start + 1, query });
    }
    expect(mocks.estimate).toHaveBeenCalledTimes(768);
    mocks.near = Array.from({ length: 16 }, (_, i) => String(i));
    send({ type: "query", requestId: 1000, query });
    expect(mocks.estimate).toHaveBeenCalledTimes(784);
    expect(mocks.spatial).toHaveBeenCalledOnce();
  });
});
