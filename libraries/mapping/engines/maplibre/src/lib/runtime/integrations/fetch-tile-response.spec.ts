import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTileResponse } from "./fetch-tile-response";

afterEach(() => vi.restoreAllMocks());

describe("tile transport deadlines", () => {
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
