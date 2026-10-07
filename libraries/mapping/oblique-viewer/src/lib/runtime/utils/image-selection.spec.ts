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
import { CardinalDirectionEnum } from "../../core/utils/orientation";
import { createImageSelectionSearch } from "./image-selection";

class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage: ((event: MessageEvent<ImageSelectionResponse>) => void) | null =
    null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(request: ImageSelectionRequest) => void>();
  terminate = vi.fn();
  constructor() {
    WorkerStub.instances.push(this);
  }
  reply(response: ImageSelectionResponse) {
    this.onmessage?.({
      data: response,
    } as MessageEvent<ImageSelectionResponse>);
  }
}
const data: ObliqueSelectionData = {
  imageRecords: new Map(),
  datasets: new Map(),
  centers: new Map(),
};
const query: ObliqueViewQuery = {
  target: { longitude: 7.2, latitude: 51.27 },
  headingRad: degToRad(324 as Degrees),
  pitchRad: degToRad(45 as Degrees),
};

describe("image selection worker lifecycle", () => {
  beforeEach(() => {
    WorkerStub.instances = [];
    vi.stubGlobal("Worker", WorkerStub);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("keeps one active query and only the latest queued query", async () => {
    const search = createImageSelectionSearch(data);
    const worker = WorkerStub.instances[0];
    const first = search.query(query),
      superseded = search.query(query),
      latest = search.query(query);
    expect(
      worker.postMessage.mock.calls.map(([message]) => message.type)
    ).toEqual(["init", "query"]);
    await expect(superseded).resolves.toBeUndefined();
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: 99,
      candidates: [],
    });
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: 1,
      candidates: [],
    });
    await expect(first).resolves.toEqual([]);
    expect(worker.postMessage.mock.calls[2][0]).toMatchObject({
      type: "query",
      requestId: 3,
    });
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: 3,
      candidates: [],
    });
    await expect(latest).resolves.toEqual([]);
    search.dispose();
  });
  it("resolves active and queued callers on disposal and rejects new work", async () => {
    const search = createImageSelectionSearch(data),
      worker = WorkerStub.instances[0];
    const first = search.query(query),
      queued = search.query(query);
    search.dispose();
    search.dispose();
    await expect(first).resolves.toBeUndefined();
    await expect(queued).resolves.toBeUndefined();
    await expect(search.query(query)).resolves.toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
  });
  it("terminates a stalled worker after the bounded timeout", async () => {
    vi.useFakeTimers();
    const search = createImageSelectionSearch(data),
      worker = WorkerStub.instances[0];
    const first = search.query(query),
      queued = search.query(query);
    await vi.advanceTimersByTimeAsync(10000);
    await expect(first).resolves.toBeUndefined();
    await expect(queued).resolves.toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans up both callers when posting to the worker fails", async () => {
    const search = createImageSelectionSearch(data),
      worker = WorkerStub.instances[0];
    const first = search.query(query),
      queued = search.query(query);
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error("worker stopped");
    });
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: 1,
      candidates: [],
    });
    await expect(first).resolves.toEqual([]);
    await expect(queued).resolves.toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("keeps scalar and navigation latest queues independent with one catalog INIT", async () => {
    const search = createImageSelectionSearch(data),
      worker = WorkerStub.instances[0];
    const active = search.query(query),
      oldBatch = search.queryBatch([query, query]),
      latestBatch = search.queryBatch([query]),
      scalar = search.query(query);
    await expect(oldBatch).resolves.toEqual([undefined, undefined]);
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: 1,
      candidates: [],
    });
    await expect(active).resolves.toEqual([]);
    expect(worker.postMessage.mock.calls[2][0]).toMatchObject({
      type: IMAGE_SELECTION_MESSAGE.QUERY_BATCH,
      requestId: 3,
      queries: [query],
    });
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT_BATCH,
      requestId: 3,
      candidates: [[]],
    });
    await expect(latestBatch).resolves.toEqual([[]]);
    expect(worker.postMessage.mock.calls[3][0]).toMatchObject({
      type: IMAGE_SELECTION_MESSAGE.QUERY,
      requestId: 4,
    });
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT,
      requestId: 4,
      candidates: [],
    });
    await expect(scalar).resolves.toEqual([]);
    expect(
      worker.postMessage.mock.calls.filter(
        ([m]) => m.type === IMAGE_SELECTION_MESSAGE.INIT
      )
    ).toHaveLength(1);
    search.dispose();
  });
  it("disposes scalar and both navigation slots without posting twelve individual queries", async () => {
    const search = createImageSelectionSearch(data),
      worker = WorkerStub.instances[0];
    const active = search.queryBatch(Array(12).fill(query)),
      scalar = search.query(query),
      queued = search.queryBatch([query]);
    expect(worker.postMessage.mock.calls.map(([m]) => m.type)).toEqual([
      IMAGE_SELECTION_MESSAGE.INIT,
      IMAGE_SELECTION_MESSAGE.QUERY_BATCH,
    ]);
    expect(() => search.queryBatch(Array(13).fill(query))).toThrow(/twelve/);
    search.dispose();
    await expect(active).resolves.toEqual(Array(12).fill(undefined));
    await expect(scalar).resolves.toBeUndefined();
    await expect(queued).resolves.toEqual([undefined]);
    await expect(search.queryBatch([query])).resolves.toEqual([undefined]);
  });
  it("hydrates batch record identities from the one existing main-thread catalog", async () => {
    const record = { id: "series::neighbor" } as ObliqueImageRecord;
    const search = createImageSelectionSearch({
        ...data,
        imageRecords: new Map([[record.id, record]]),
      }),
      worker = WorkerStub.instances[0];
    const result = search.queryBatch([query]);
    worker.reply({
      type: IMAGE_SELECTION_MESSAGE.RESULT_BATCH,
      requestId: 1,
      candidates: [
        [
          {
            imageId: record.id,
            distanceOnGround: 1,
            distanceToCamera: 2,
            imageCenter: {
              x: 0,
              y: 0,
              longitude: 7.2,
              latitude: 51.27,
              cardinal: CardinalDirectionEnum.North,
            },
            coversTarget: true,
          },
        ],
      ],
    });
    expect((await result)[0]?.[0].record).toBe(record);
    search.dispose();
  });
  it("isolates invalid fallback queries and resolves disposed batches without a Worker", async () => {
    vi.stubGlobal("Worker", undefined);
    const search = createImageSelectionSearch(data);
    const invalid = {
      ...query,
      target: undefined,
    } as unknown as ObliqueViewQuery;
    await expect(search.queryBatch([query, invalid, query])).resolves.toEqual([
      [],
      undefined,
      [],
    ]);
    search.dispose();
    await expect(search.queryBatch([query, query])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });
});
