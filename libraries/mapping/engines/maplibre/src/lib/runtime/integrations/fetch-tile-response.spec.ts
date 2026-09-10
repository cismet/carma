// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadPriorityQueue } from "3d-tiles-renderer/core";
import { fetchTileResponse } from "./fetch-tile-response";

afterEach(() => vi.restoreAllMocks());

describe("tile transport deadlines", () => {
  it("lets another corridor finish while the first response is stalled", async () => {
    const queue = new DownloadPriorityQueue();
    queue.maxJobsPerOrigin = 2;
    let release!: (response: Response) => void;
    const slow = new Promise<Response>((resolve) => { release = resolve; });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("slow.b3dm") ? slow : new Response("ready")
    );
    const first = queue.add("https://tiles.test/slow.b3dm", {}, () =>
      fetchTileResponse("https://tiles.test/slow.b3dm", {})
    );
    const second = queue.add("https://tiles.test/fast.b3dm", {}, () =>
      fetchTileResponse("https://tiles.test/fast.b3dm", {})
    );
    for (const origin of queue.originQueues.values()) origin.tryRunJobs();
    try {
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(await (await second).text()).toBe("ready");
      expect(queue.running).toBe(true);
    } finally {
      release(new Response("late"));
      await first;
    }
  });

  it.each(["arrayBuffer", "json"] as const)(
    "normalizes a stalled %s body's AbortError for native retries",
    async (reader) => {
      const deadline = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
      const response = new Response("{}");
      const abort = new DOMException("Body aborted", "AbortError");
      vi.spyOn(response, reader).mockRejectedValue(abort);
      vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
      const received = await fetchTileResponse("tile.json", {});
      expect(received).toBe(response);
      const reason = new DOMException("Deadline", "TimeoutError");
      deadline.abort(reason);
      await expect(received[reader]()).rejects.toBe(reason);
    }
  );

  it("preserves HTTP failures for the existing permanent-error policy", async () => {
    const caller = new AbortController();
    const response = new Response("missing", { status: 404 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const received = await fetchTileResponse("tile.b3dm", {
      signal: caller.signal,
    });
    expect(received.status).toBe(404);
    expect(await received.arrayBuffer()).toEqual(
      new TextEncoder().encode("missing").buffer
    );
  });
});
