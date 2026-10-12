import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ObliqueDataset,
  ObliqueImageRecord,
  PointWithSector,
} from "../../core/types";
import type { ObliqueData } from "./load-oblique-series";
import type { ObliqueSeriesWorkerMessage } from "./oblique-series.worker";

const loader = vi.hoisted(() => vi.fn());
vi.mock("./optional-catalog-cache", () => ({
  loadWithOptionalCatalogCache: loader,
}));

let scope: {
  onmessage: ((event: MessageEvent) => Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
};
beforeEach(async () => {
  vi.resetModules();
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal("self", scope);
  await import("./oblique-series.worker");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const dataset = { id: "series" } as ObliqueDataset;
const catalog = (count: number): ObliqueData => ({
  imageRecords: new Map(
    Array.from({ length: count }, (_, i) => [
      `r${i}`,
      { id: `r${i}` } as ObliqueImageRecord,
    ])
  ),
  centers: new Map(
    Array.from({ length: count }, (_, i) => [
      `r${i}`,
      { id: `r${i}` } as PointWithSector,
    ])
  ),
  datasets: new Map([[dataset.id, dataset]]),
});
const request = async (fetchPriority?: RequestPriority) => {
  await scope.onmessage!({
    data: { dataset, fetchPriority },
  } as MessageEvent);
  return scope.postMessage.mock.calls.map(
    ([message]) => message as ObliqueSeriesWorkerMessage
  );
};

describe("metadata worker answer", () => {
  it("posts a small catalog unchanged in one message", async () => {
    const data = catalog(10);
    loader.mockResolvedValueOnce(data);
    const messages = await request();
    expect(messages).toHaveLength(1);
    expect(messages[0].data).toBe(data);
    expect(loader).toHaveBeenCalledWith(dataset, undefined, {
      fetchPriority: undefined,
    });
  });

  it("splits a large catalog into ordered chunks before the final answer", async () => {
    const data = catalog(9000);
    loader.mockResolvedValueOnce(data);
    const messages = await request("low");
    expect(
      messages.map(
        (message) => (message.chunk ?? message.data)!.imageRecords.size
      )
    ).toEqual([...Array(8).fill(1024), 808]);
    expect(messages.slice(0, -1).every((message) => !message.data)).toBe(true);
    expect(
      messages.flatMap((message) => [
        ...(message.chunk ?? message.data)!.imageRecords.keys(),
      ])
    ).toEqual([...data.imageRecords.keys()]);
    expect(
      messages.flatMap((message) => [
        ...(message.chunk ?? message.data)!.centers.keys(),
      ])
    ).toEqual([...data.centers.keys()]);
    expect(messages.at(-1)!.data!.datasets).toBe(data.datasets);
    expect(loader).toHaveBeenCalledWith(dataset, undefined, {
      fetchPriority: "low",
    });
  });

  it("yields before posting the next chunk instead of queuing a catalog burst", async () => {
    vi.useFakeTimers();
    loader.mockResolvedValueOnce(catalog(2050));
    const result = request();
    // Flush the mocked loader continuation without advancing the chunk timer.
    for (
      let attempt = 0;
      attempt < 5 && !scope.postMessage.mock.calls.length;
      attempt++
    ) {
      await Promise.resolve();
    }
    expect(scope.postMessage).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    const messages = await result;
    expect(messages).toHaveLength(3);
    expect(messages.at(-1)!.data!.imageRecords.size).toBe(2);
  });

  it("reports a failure as one error message", async () => {
    loader.mockRejectedValueOnce(new Error("Metadaten: HTTP 503"));
    expect(await request()).toEqual([{ error: "Metadaten: HTTP 503" }]);
  });
});
