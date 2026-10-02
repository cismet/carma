import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import type { ObliqueSelectionData, ObliqueViewQuery } from "../../core/types";
import {
  IMAGE_SELECTION_MESSAGE,
  type ImageSelectionRequest,
  type ImageSelectionResponse,
} from "./image-selection-messages";
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
});
