import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../../core/types";
import {
  IMAGE_SELECTION_MESSAGE,
  type ImageSelectionRequest,
  type ImageSelectionResponse,
} from "./image-selection-messages";
const mocks = vi.hoisted(() => ({
  index: vi.fn(),
  rank: vi.fn(),
  candidates: vi.fn(),
}));
vi.mock("../../core/utils/image-selection-index", () => ({
  createImageSelectionIndex: mocks.index,
}));
vi.mock("../../core/utils/selection", () => ({
  rankImagesForViewWithDirectionalFallback: (
    data: ObliqueSelectionData,
    query: ObliqueViewQuery,
    getCandidates: (allDirections: boolean) => Iterable<ObliqueImageRecord>
  ) => {
    const preferred = mocks.rank(data, query, getCandidates(false));
    if (
      query.cameraView === "nadir" ||
      preferred.some(
        (candidate: { coversTarget?: boolean }) => candidate.coversTarget
      )
    )
      return preferred;
    const fallback = mocks.rank(data, query, getCandidates(true));
    return fallback.length ? fallback : preferred;
  },
}));
const data: ObliqueSelectionData = {
  imageRecords: new Map(),
  datasets: new Map(),
  centers: new Map(),
};
const query: ObliqueViewQuery = {
  target: { longitude: 7.2, latitude: 51.27 },
  headingRad: degToRad(0 as Degrees),
  pitchRad: degToRad(45 as Degrees),
  numCandidates: 4,
  excludeImageId: "current",
};
let scope: {
  onmessage: ((event: MessageEvent<ImageSelectionRequest>) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
};
const send = (request: ImageSelectionRequest) =>
  scope.onmessage?.({ data: request } as MessageEvent<ImageSelectionRequest>);
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.index.mockImplementation(() => ({
    append: vi.fn(),
    candidates: mocks.candidates,
  }));
  mocks.candidates.mockReturnValue([]);
  mocks.rank.mockReturnValue([
    { record: { id: "neighbor" } as ObliqueImageRecord, coversTarget: true },
  ]);
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal("self", scope);
  await import("./image-selection.worker");
  send({ type: IMAGE_SELECTION_MESSAGE.INIT, data });
});
afterEach(() => vi.unstubAllGlobals());
describe("persistent selection worker batch protocol", () => {
  it("fills one persistent index from catalog parts before queries run", () => {
    mocks.index.mockClear();
    const first = {
      ...data,
      imageRecords: new Map([["first", { id: "first" } as ObliqueImageRecord]]),
    };
    const second = {
      ...data,
      imageRecords: new Map([
        ["second", { id: "second" } as ObliqueImageRecord],
      ]),
    };
    send({
      type: IMAGE_SELECTION_MESSAGE.INIT,
      data: first,
      append: false,
      complete: false,
    });
    expect(mocks.index).toHaveBeenCalledOnce();
    send({
      type: IMAGE_SELECTION_MESSAGE.INIT,
      data: second,
      append: true,
      complete: true,
    });
    expect(mocks.index).toHaveBeenCalledOnce();
    const index = mocks.index.mock.results[0].value;
    expect(index.append).toHaveBeenCalledTimes(2);
    expect([...index.append.mock.calls[0][0].imageRecords.keys()]).toEqual([
      "first",
    ]);
    expect([...index.append.mock.calls[1][0].imageRecords.keys()]).toEqual([
      "second",
    ]);
    send({ type: IMAGE_SELECTION_MESSAGE.QUERY, requestId: 1, query });
    expect(mocks.rank.mock.calls[0][0].imageRecords.size).toBe(2);
  });

  it("ranks six navigation queries in one RPC and reuses the same index for scalar selection", () => {
    send({
      type: IMAGE_SELECTION_MESSAGE.QUERY_BATCH,
      requestId: 1,
      queries: Array(6).fill(query),
    });
    const batch = scope.postMessage.mock.calls[0][0] as ImageSelectionResponse;
    expect(batch).toMatchObject({
      type: IMAGE_SELECTION_MESSAGE.RESULT_BATCH,
      requestId: 1,
      candidates: Array(6).fill([{ imageId: "neighbor", coversTarget: true }]),
    });
    expect(mocks.index).toHaveBeenCalledTimes(1);
    expect(mocks.candidates).toHaveBeenCalledTimes(6);
    expect(mocks.rank.mock.calls[0][1]).toMatchObject({
      excludeImageId: "current",
      numCandidates: 4,
    });
    send({ type: IMAGE_SELECTION_MESSAGE.QUERY, requestId: 2, query });
    expect(mocks.index).toHaveBeenCalledTimes(1);
    expect(mocks.rank).toHaveBeenCalledTimes(7);
    expect(scope.postMessage.mock.calls[1][0].type).toBe(
      IMAGE_SELECTION_MESSAGE.RESULT
    );
  });
  it("retries an uncovered preferred-sector selection across loaded directions", () => {
    const fallback = {
      record: { id: "other-direction" } as ObliqueImageRecord,
      coversTarget: true,
    };
    mocks.rank.mockReturnValueOnce([]).mockReturnValueOnce([fallback]);
    send({ type: IMAGE_SELECTION_MESSAGE.QUERY, requestId: 8, query });
    expect(mocks.candidates.mock.calls.map(([, options]) => options)).toEqual([
      { allDirections: false, limitPerDirection: 256 },
      { allDirections: true, limitPerDirection: 256 },
    ]);
    expect(scope.postMessage.mock.calls[0][0]).toMatchObject({
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: 8,
      candidates: [{ imageId: "other-direction", coversTarget: true }],
    });
  });
  it("keeps one failed query independent and rejects an oversized batch before ranking", () => {
    const bad = { ...query, headingRad: degToRad(90 as Degrees) };
    mocks.rank.mockImplementation((_data, q) => {
      if (q === bad) throw Error("one invalid geometry fixture");
      return [];
    });
    send({
      type: IMAGE_SELECTION_MESSAGE.QUERY_BATCH,
      requestId: 3,
      queries: [query, bad, query],
    });
    expect(scope.postMessage.mock.calls[0][0]).toMatchObject({
      candidates: [[], undefined, []],
    });
    const calls = mocks.rank.mock.calls.length;
    send({
      type: IMAGE_SELECTION_MESSAGE.QUERY_BATCH,
      requestId: 4,
      queries: Array(13).fill(query),
    });
    expect(scope.postMessage.mock.calls[1][0]).toEqual({
      type: IMAGE_SELECTION_MESSAGE.ERROR,
      requestId: 4,
    });
    expect(mocks.rank).toHaveBeenCalledTimes(calls);
  });
});
