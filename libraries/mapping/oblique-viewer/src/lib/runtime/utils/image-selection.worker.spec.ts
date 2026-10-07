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
  rankImagesForView: mocks.rank,
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
  mocks.index.mockReturnValue({ candidates: mocks.candidates });
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
