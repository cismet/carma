import { describe, expect, it, vi } from "vitest";
import { createAvifRangeTransport } from "./avif-range-transport";

const signal = () => new AbortController().signal;
const bytes = (start: number, length: number) =>
  Uint8Array.from({ length }, (_, i) => start + i);
const partial = (offset: number, length: number, total: number) =>
  new Response(bytes(offset, length), {
    status: 206,
    headers: {
      "Content-Range": `bytes ${offset}-${offset + length - 1}/${total}`,
      "Content-Length": String(length),
      ETag: '"prefix-v1"',
    },
  });
const stream = (chunks: Uint8Array[], cancel = vi.fn()) =>
  new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
      cancel,
    },
    { highWaterMark: 0 }
  );

describe("bounded native AVIF bootstrap transport", () => {
  it("retains the ordinary-GET contract for callers without rangeBytes", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(stream([bytes(0, 3), bytes(3, 5)], cancel))
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const chunk = vi.fn((_bytes: Uint8Array) => true);
    await transport.streamPrefix({
      url: "/native.avif",
      signal: signal(),
      maxBytes: 32,
      onChunk: chunk,
    });
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).get("Range")
    ).toBeNull();
    expect(chunk).toHaveBeenCalledOnce();
    expect(chunk.mock.calls[0][0]).toEqual(bytes(0, 3));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a bounded response as soon as the prefix is usable", async () => {
    const cancel = vi.fn(),
      onRequest = vi.fn(),
      onBytes = vi.fn();
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(stream([bytes(0, 2), bytes(2, 2), bytes(4, 4)], cancel), {
          status: 206,
          headers: { "Content-Range": "bytes 0-7/20", "Content-Length": "8" },
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    let received = 0;
    await transport.streamPrefix({
      url: "/native.avif",
      signal: signal(),
      maxBytes: 20,
      rangeBytes: 8,
      onRequest,
      onBytes,
      onChunk(chunk) {
        received += chunk.length;
        return received >= 3;
      },
    });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Range")).toBe(
      "bytes=0-7"
    );
    expect(onRequest).toHaveBeenCalledOnce();
    expect(onBytes.mock.calls.map(([count]) => count)).toEqual([2, 4]);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("continues only adjacent windows and reports cumulative delivered bytes", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const range = new Headers(init?.headers).get("Range");
        return range === "bytes=0-3" ? partial(0, 4, 20) : partial(4, 4, 20);
      }
    );
    const onResponse = vi.fn(),
      onRequest = vi.fn(),
      onBytes = vi.fn();
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const chunks: number[] = [];
    await transport.streamPrefix({
      url: "/native.avif",
      signal: signal(),
      maxBytes: 12,
      rangeBytes: 4,
      onResponse,
      onRequest,
      onBytes,
      onChunk(chunk) {
        chunks.push(...chunk);
        return chunks.length >= 7;
      },
    });
    expect(
      fetcher.mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("Range")
      )
    ).toEqual(["bytes=0-3", "bytes=4-7"]);
    expect(chunks).toEqual([...bytes(0, 8)]);
    expect(onResponse).toHaveBeenCalledTimes(2);
    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(onBytes.mock.calls.map(([count]) => count)).toEqual([4, 8]);
  });

  it.each([true, false])(
    "accepts short EOF only if it contains the complete prefix: %s",
    async (complete) => {
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, _init?: RequestInit) => partial(0, 3, 3)
      );
      const transport = createAvifRangeTransport({ fetch: fetcher });
      const pending = transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 16,
        rangeBytes: 8,
        onChunk: () => complete,
      });
      if (complete) await expect(pending).resolves.toBeUndefined();
      else await expect(pending).rejects.toThrow(/Incomplete native/);
      expect(fetcher).toHaveBeenCalledOnce();
    }
  );

  it("clips the final request to the aggregate budget and never requests beyond it", async () => {
    let offset = 0;
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => {
        const length = Math.min(4, 10 - offset),
          response = partial(offset, length, 20);
        offset += length;
        return response;
      }
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onBytes = vi.fn();
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 10,
        rangeBytes: 4,
        onBytes,
        onChunk: () => false,
      })
    ).rejects.toThrow(/byte limit/);
    expect(
      fetcher.mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("Range")
      )
    ).toEqual(["bytes=0-3", "bytes=4-7", "bytes=8-9"]);
    expect(onBytes).toHaveBeenLastCalledWith(10);
  });

  it("keeps early stream cancellation when the server ignores the first Range", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(stream([bytes(0, 3), bytes(3, 100)], cancel), {
          headers: { "Content-Length": "103" },
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onBytes = vi.fn();
    await transport.streamPrefix({
      url: "/native.avif",
      signal: signal(),
      maxBytes: 16,
      rangeBytes: 8,
      onBytes,
      onChunk: () => true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(onBytes).toHaveBeenCalledTimes(1);
    expect(onBytes).toHaveBeenCalledWith(3);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each<Record<string, string>>([
    { "Content-Range": "bytes 1-4/20" },
    { "Content-Range": "bytes 0-8/20" },
    { "Content-Range": "bytes 0-1/20" },
    { "Content-Range": "bytes 0-3/20", "Content-Length": "8" },
  ])(
    "rejects an ambiguous or mismatched 206 before publishing: %j",
    async (headers) => {
      const cancel = vi.fn();
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, _init?: RequestInit) =>
          new Response(stream([bytes(0, 4)], cancel), { status: 206, headers })
      );
      const transport = createAvifRangeTransport({ fetch: fetcher });
      const onChunk = vi.fn(() => true);
      await expect(
        transport.streamPrefix({
          url: "/native.avif",
          signal: signal(),
          maxBytes: 20,
          rangeBytes: 4,
          onChunk,
        })
      ).rejects.toThrow(/Content-/);
      expect(onChunk).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    }
  );

  it("accepts a CORS-hidden Content-Range only with the exact requested Content-Length", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(bytes(0, 4), {
          status: 206,
          headers: {
            "Content-Length": "4",
            "Last-Modified": "Sat, 10 Oct 2026 12:00:00 GMT",
          },
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onResponse = vi.fn(),
      onChunk = vi.fn(() => true);
    await transport.streamPrefix({
      url: "/native.avif",
      signal: signal(),
      maxBytes: 20,
      rangeBytes: 4,
      onResponse,
      onChunk,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Range")).toBe(
      "bytes=0-3"
    );
    expect(onResponse).toHaveBeenCalledOnce();
    expect(onChunk).toHaveBeenCalledWith(bytes(0, 4));
  });

  it.each([undefined, "2"])(
    "retries only an ambiguous first window as ordinary GET without consuming its body: length=%s",
    async (length) => {
      const cancel = vi.fn();
      const body = stream([bytes(0, 4)], cancel);
      const read = vi.spyOn(body, "getReader");
      const first = new Response(body, {
        status: 206,
        headers: {
          ...(length === undefined ? {} : { "Content-Length": length }),
          "Last-Modified": "Sat, 10 Oct 2026 12:00:00 GMT",
        },
      });
      const fallbackCancel = vi.fn();
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(
          new Response(stream([bytes(0, 3), bytes(3, 17)], fallbackCancel), {
            headers: {
              "Content-Length": "20",
              "Last-Modified": "Sat, 10 Oct 2026 12:00:00 GMT",
            },
          })
        );
      const transport = createAvifRangeTransport({ fetch: fetcher });
      const onRequest = vi.fn(),
        onResponse = vi.fn(),
        onBytes = vi.fn();
      await transport.streamPrefix({
        url: "/same-native.avif",
        signal: signal(),
        maxBytes: 20,
        rangeBytes: 4,
        onRequest,
        onResponse,
        onBytes,
        onChunk: () => true,
      });
      expect(
        fetcher.mock.calls.map(([url, init]) => [
          url,
          new Headers(init?.headers).get("Range"),
        ])
      ).toEqual([
        ["/same-native.avif", "bytes=0-3"],
        ["/same-native.avif", null],
      ]);
      expect(read).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(fallbackCancel).toHaveBeenCalledOnce();
      expect(onRequest).toHaveBeenCalledTimes(2);
      expect(onResponse).toHaveBeenCalledTimes(2);
      expect(onBytes.mock.calls).toEqual([[3]]);
    }
  );

  it("does not restart from byte zero for an ambiguous continuation window", async () => {
    const cancel = vi.fn();
    const body = stream([bytes(4, 2)], cancel),
      read = vi.spyOn(body, "getReader");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(partial(0, 4, 20))
      .mockResolvedValueOnce(
        new Response(body, { status: 206, headers: { "Content-Length": "2" } })
      );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onChunk = vi.fn(() => false);
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 20,
        rangeBytes: 4,
        onChunk,
      })
    ).rejects.toThrow(/Ambiguous native/);
    expect(read).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenCalledOnce();
  });

  it("does not apply the hidden single-range header exception to multipart bodies", async () => {
    const cancel = vi.fn(),
      body = stream([bytes(0, 4)], cancel);
    const read = vi.spyOn(body, "getReader");
    const fetcher = vi.fn(
      async () =>
        new Response(body, {
          status: 206,
          headers: {
            "Content-Type": "multipart/byteranges; boundary=sample",
            "Content-Length": "4",
          },
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onChunk = vi.fn(() => true);
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 20,
        rangeBytes: 4,
        onChunk,
      })
    ).rejects.toThrow(/Multipart native/);
    expect(read).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a truncated bounded response instead of skipping to the next range", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(bytes(0, 2), {
          status: 206,
          headers: { "Content-Range": "bytes 0-3/20" },
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 20,
        rangeBytes: 4,
        onChunk: () => false,
      })
    ).rejects.toThrow(/Incomplete native/);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects bytes beyond a declared range before publishing that chunk", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(bytes(0, 8), {
          status: 206,
          headers: { "Content-Range": "bytes 0-3/20" },
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onChunk = vi.fn(() => true);
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 20,
        rangeBytes: 4,
        onChunk,
      })
    ).rejects.toThrow(/exceeds Content-Range/);
    expect(onChunk).not.toHaveBeenCalled();
  });

  it("does not append a full 200 body at a continuation offset", async () => {
    const cancel = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(partial(0, 4, 20))
      .mockResolvedValueOnce(new Response(stream([bytes(0, 20)], cancel)));
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onChunk = vi.fn(() => false);
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 20,
        rangeBytes: 4,
        onChunk,
      })
    ).rejects.toMatchObject({ status: 200 });
    expect(onChunk).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects changed resource length between windows", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(partial(0, 4, 20))
      .mockResolvedValueOnce(partial(4, 4, 21));
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const onChunk = vi.fn(() => false);
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: signal(),
        maxBytes: 20,
        rangeBytes: 4,
        onChunk,
      })
    ).rejects.toThrow(/resource length changed/);
    expect(onChunk).toHaveBeenCalledOnce();
  });

  it("cancels an aborted response without scheduling another window", async () => {
    const controller = new AbortController(),
      cancel = vi.fn();
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(stream([bytes(0, 2), bytes(2, 2)], cancel), {
          status: 206,
          headers: { "Content-Range": "bytes 0-3/20" },
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    await expect(
      transport.streamPrefix({
        url: "/native.avif",
        signal: controller.signal,
        maxBytes: 20,
        rangeBytes: 4,
        onChunk() {
          controller.abort();
          return false;
        },
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
