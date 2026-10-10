import { describe, expect, it, vi } from "vitest";
import {
  createAvifRangeTransport,
  planAvifRangeRequests,
} from "./avif-range-transport";

const encode = (s: string) => new TextEncoder().encode(s);
const signal = () => new AbortController().signal;
const ranges = [
  { offset: 0, length: 3 },
  { offset: 10, length: 3 },
];
const single = (
  offset: number,
  bytes = new Uint8Array([1, 2, 3]),
  total = 100
) =>
  new Response(bytes, {
    status: 206,
    headers: {
      "Content-Range": `bytes ${offset}-${offset + bytes.length - 1}/${total}`,
    },
  });
const multi = (
  parts: { offset: number; bytes: Uint8Array; total?: number }[],
  chunkSize = 1
) => {
  const chunks: Uint8Array[] = [];
  parts.forEach((p, i) =>
    chunks.push(
      encode(
        `${
          i ? "\r\n" : ""
        }--quoted-boundary\r\nContent-Type: image/avif\r\nContent-Range: bytes ${
          p.offset
        }-${p.offset + p.bytes.length - 1}/${p.total ?? 1000}\r\n\r\n`
      ),
      p.bytes
    )
  );
  chunks.push(encode("\r\n--quoted-boundary--\r\n"));
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  let position = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (position === all.length) {
          controller.close();
          return;
        }
        controller.enqueue(all.slice(position, position + chunkSize));
        position = Math.min(position + chunkSize, all.length);
      },
    }),
    {
      status: 206,
      headers: {
        "Content-Type": 'multipart/byteranges; boundary="quoted-boundary"',
      },
    }
  );
};
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const read = (
  transport: ReturnType<typeof createAvifRangeTransport>,
  extra: Partial<Parameters<typeof transport.read>[0]> = {}
) =>
  transport.read({
    url: "/a.avif",
    ranges,
    signal: signal(),
    onPart: vi.fn(),
    ...extra,
  });

describe("bounded AVIF range planning", () => {
  it("merges overlap and adjacency only, without gap bytes or input mutation", () => {
    const input = [
      { offset: 10, length: 2 },
      { offset: 0, length: 3 },
      { offset: 2, length: 4 },
      { offset: 6, length: 1 },
    ];
    expect(planAvifRangeRequests(input)).toEqual([
      [
        { offset: 0, length: 7 },
        { offset: 10, length: 2 },
      ],
    ]);
    expect(input[0]).toEqual({ offset: 10, length: 2 });
  });
  it("bounds payload and parts, splitting oversized spans without losing bytes", () => {
    expect(
      planAvifRangeRequests(
        [
          { offset: 0, length: 9 },
          { offset: 20, length: 1 },
          { offset: 30, length: 1 },
        ],
        { maxBytes: 4, maxSingleBytes: 4, maxParts: 2 }
      )
    ).toEqual([
      [{ offset: 0, length: 4 }],
      [{ offset: 4, length: 4 }],
      [{ offset: 8, length: 1 }],
      [
        { offset: 20, length: 1 },
        { offset: 30, length: 1 },
      ],
    ]);
    for (const range of [
      { offset: -1, length: 1 },
      { offset: 0, length: 0 },
      { offset: 0.1, length: 1 },
      { offset: Number.MAX_SAFE_INTEGER, length: 1 },
    ])
      expect(() => planAvifRangeRequests([range])).toThrow();
    expect(() => planAvifRangeRequests([], { maxParts: 9 })).toThrow();
    expect(() =>
      planAvifRangeRequests([], { maxBytes: 4 * 1024 * 1024 + 1 })
    ).toThrow();
  });
  it("keeps moderate contiguous levels in one GET while bounding disjoint payloads", () => {
    const size = 1_500_000;
    expect(planAvifRangeRequests([{ offset: 0, length: size }])).toEqual([
      [{ offset: 0, length: size }],
    ]);
    const groups = planAvifRangeRequests([
      { offset: 0, length: 5 * 1024 * 1024 },
      { offset: 8 * 1024 * 1024, length: 600_000 },
      { offset: 9 * 1024 * 1024, length: 600_000 },
    ]);
    expect(
      groups.map((parts) => parts.reduce((sum, p) => sum + p.length, 0))
    ).toEqual([4 * 1024 * 1024, 1024 * 1024, 1_200_000]);
  });
});

describe("adaptive AVIF range protocol", () => {
  it("streams quoted multipart boundaries across arbitrary binary chunks in response order", async () => {
    const binary = new Uint8Array([0, 255, 13]);
    const onPart = vi.fn();
    const fetcher = vi.fn(async () =>
      multi([
        { offset: 10, bytes: binary },
        { offset: 0, bytes: new Uint8Array([4, 5, 6]) },
      ])
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    await read(transport, { onPart, priority: "low", cache: "no-cache" });
    expect(onPart.mock.calls.map(([p, b]) => [p.offset, [...b]])).toEqual([
      [10, [0, 255, 13]],
      [0, [4, 5, 6]],
    ]);
    expect(onPart.mock.calls[0][1].buffer).not.toBe(
      onPart.mock.calls[1][1].buffer
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/a.avif",
      expect.objectContaining({
        headers: { Range: "bytes=0-2,10-12" },
        priority: "low",
        cache: "no-cache",
      })
    );
  });
  it("publishes a checked part before later payload arrives, without retaining response chunks", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const onPart = vi.fn();
    const transport = createAvifRangeTransport({
      fetch: vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(c) {
                stream = c;
              },
            }),
            {
              status: 206,
              headers: { "Content-Type": "multipart/byteranges; boundary=x" },
            }
          )
      ),
    });
    const pending = read(transport, { onPart });
    await settle();
    const chunk = encode(
      "--x\r\nContent-Range: bytes 0-2/100\r\n\r\nabc\r\n--x\r\n"
    );
    stream.enqueue(chunk);
    await settle();
    expect(onPart).toHaveBeenCalledTimes(1);
    chunk.fill(0);
    expect([...onPart.mock.calls[0][1]]).toEqual([...encode("abc")]);
    stream.enqueue(
      encode("Content-Range: bytes 10-12/100\r\n\r\ndef\r\n--x--\r\n")
    );
    stream.close();
    await pending;
    expect(onPart).toHaveBeenCalledTimes(2);
  });
  it("accepts bounded coalesced ranges but publishes only independently owned requested spans", async () => {
    const onPart = vi.fn();
    await read(
      createAvifRangeTransport({
        fetch: vi.fn(async () =>
          single(0, new Uint8Array(Array.from({ length: 13 }, (_, i) => i)))
        ),
      }),
      { onPart }
    );
    expect(onPart.mock.calls.map(([p, b]) => [p, [...b]])).toEqual([
      [ranges[0], [0, 1, 2]],
      [ranges[1], [10, 11, 12]],
    ]);
    expect(onPart.mock.calls[0][1].buffer).not.toBe(
      onPart.mock.calls[1][1].buffer
    );
  });
  it("binary payload may contain literal MIME boundary text", async () => {
    const bytes = encode("\r\n--quoted-boundary--\r\n");
    const onPart = vi.fn();
    await read(
      createAvifRangeTransport({
        fetch: vi.fn(async () => multi([{ offset: 0, bytes }])),
      }),
      { ranges: [{ offset: 0, length: bytes.length }], onPart }
    );
    expect(onPart.mock.calls[0][1]).toEqual(bytes);
  });
  it("refuses a 200 before accessing its body and falls back to safe singles once", async () => {
    const cancel = vi.fn(async () => undefined),
      getReader = vi.fn(() => {
        throw Error("must not read");
      });
    const fetcher = vi.fn(async (_url, init) =>
      new Headers(init?.headers).get("Range")!.includes(",")
        ? ({ status: 200, body: { cancel, getReader } } as unknown as Response)
        : single(
            Number(new Headers(init?.headers).get("Range")!.match(/\d+/)![0])
          )
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    await read(transport);
    await read(transport);
    expect(getReader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("falls back for CORS multi failures and an ambiguous 206, not for aborts", async () => {
    for (const failure of [
      new TypeError("Failed to fetch"),
      new Response(new Uint8Array([1]), { status: 206 }),
    ]) {
      const fetcher = vi.fn(async (_url, init) => {
        const header = new Headers(init?.headers).get("Range")!;
        if (header.includes(",")) {
          if (failure instanceof Error) throw failure;
          return failure;
        }
        return single(Number(header.match(/\d+/)![0]));
      });
      await read(createAvifRangeTransport({ fetch: fetcher }));
      expect(fetcher).toHaveBeenCalledTimes(3);
    }
  });
  it("keeps an accepted single-part answer and requests only the missing interval", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(single(10))
      .mockResolvedValueOnce(single(0));
    const onPart = vi.fn();
    await read(createAvifRangeTransport({ fetch: fetcher }), { onPart });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onPart.mock.calls.map(([r]) => r.offset)).toEqual([10, 0]);
    expect(fetcher.mock.calls[1][1].headers.Range).toBe("bytes=0-2");
  });
  it("validates short EOF discovery with and without exposed Content-Range", async () => {
    for (const response of [
      single(10, new Uint8Array([1, 2]), 12),
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: { "Content-Length": "2" },
      }),
    ]) {
      const onPart = vi.fn();
      await read(
        createAvifRangeTransport({ fetch: vi.fn(async () => response) }),
        { ranges: [{ offset: 10, length: 4 }], allowShort: true, onPart }
      );
      expect(onPart).toHaveBeenCalledWith(
        { offset: 10, length: 2 },
        new Uint8Array([1, 2])
      );
    }
    await expect(
      read(
        createAvifRangeTransport({
          fetch: vi.fn(async () => single(10, new Uint8Array([1, 2]), 100)),
        }),
        { ranges: [{ offset: 10, length: 4 }], allowShort: true }
      )
    ).rejects.toThrow("Unrequested");
  });
  it.each([
    [
      "short payload",
      () =>
        new Response(new Uint8Array([1, 2]), {
          status: 206,
          headers: { "Content-Range": "bytes 0-2/100" },
        }),
    ],
    [
      "long payload",
      () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: { "Content-Range": "bytes 0-2/100" },
        }),
    ],
    [
      "wrong length",
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 206,
          headers: { "Content-Range": "bytes 0-2/100", "Content-Length": "2" },
        }),
    ],
    ["outside range", () => single(1)],
    ["invalid total", () => single(0, new Uint8Array([1, 2, 3]), 2)],
  ])("rejects %s without publishing invalid data", async (_name, response) => {
    const onPart = vi.fn(),
      fetcher = vi.fn(async () => response());
    await expect(
      read(createAvifRangeTransport({ fetch: fetcher }), {
        ranges: [ranges[0]],
        onPart,
      })
    ).rejects.toThrow();
    expect(onPart).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects overlapping, missing, inconsistent, or oversized multipart responses without fallback", async () => {
    const cases = [
      [
        { offset: 0, bytes: new Uint8Array(3) },
        { offset: 0, bytes: new Uint8Array(3) },
      ],
      [{ offset: 0, bytes: new Uint8Array(3) }],
      [
        { offset: 0, bytes: new Uint8Array(3), total: 100 },
        { offset: 10, bytes: new Uint8Array(3), total: 200 },
      ],
      [{ offset: 0, bytes: new Uint8Array(14) }],
    ];
    for (const parts of cases) {
      const fetcher = vi.fn(async () => multi(parts, 1000));
      await expect(
        read(createAvifRangeTransport({ fetch: fetcher }))
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("does not publish malformed delimiter parts or buffer unlimited headers", async () => {
    for (const body of [
      "--x\r\nContent-Range: bytes 0-2/100\r\n\r\nabcX\r\n--x--\r\n",
      `--x\r\nX: ${"a".repeat(8192)}\r\n\r\n`,
    ]) {
      const onPart = vi.fn();
      const transport = createAvifRangeTransport({
        fetch: vi.fn(
          async () =>
            new Response(body, {
              status: 206,
              headers: { "Content-Type": "multipart/byteranges; boundary=x" },
            })
        ),
      });
      await expect(read(transport, { onPart })).rejects.toThrow();
      expect(onPart).not.toHaveBeenCalled();
    }
  });
  it("budget, asset identity and consumer errors never trigger fallback", async () => {
    for (const field of ["onRequest", "onResponse", "onPart"] as const) {
      const failure = new TypeError(field),
        fetcher = vi.fn(async () =>
          multi(
            [
              { offset: 0, bytes: new Uint8Array(3) },
              { offset: 10, bytes: new Uint8Array(3) },
            ],
            1000
          )
        );
      const options = {
        [field]: () => {
          throw failure;
        },
      };
      await expect(
        read(createAvifRangeTransport({ fetch: fetcher }), options)
      ).rejects.toBe(failure);
      expect(fetcher).toHaveBeenCalledTimes(field === "onRequest" ? 0 : 1);
    }
  });
  it("aborts a hanging response reader, does not fallback, and disposes queued jobs", async () => {
    const canceled = vi.fn();
    const ac = new AbortController();
    const fetcher = vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel: canceled }), {
          status: 206,
          headers: { "Content-Type": "multipart/byteranges; boundary=x" },
        })
    );
    const transport = createAvifRangeTransport({
      fetch: fetcher,
      concurrency: 1,
    });
    const active = read(transport, { signal: ac.signal });
    const pending = read(transport, { url: "/queued" });
    const assertions = Promise.all([
      expect(active).rejects.toMatchObject({ name: "AbortError" }),
      expect(pending).rejects.toMatchObject({ name: "AbortError" }),
    ]);
    await settle();
    transport.dispose();
    await assertions;
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(read(transport)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("limits HTTP concurrency to three and dispatches queued high before low", async () => {
    const completions: (() => void)[] = [];
    const starts: string[] = [];
    let inFlight = 0,
      max = 0;
    const fetcher = vi.fn(
      (url) =>
        new Promise<Response>((resolve) => {
          starts.push(String(url));
          inFlight++;
          max = Math.max(max, inFlight);
          completions.push(() => {
            inFlight--;
            resolve(single(0));
          });
        })
    );
    const transport = createAvifRangeTransport({ fetch: fetcher });
    const jobs = [0, 1, 2, 3].map((i) =>
      read(transport, { url: `/low${i}`, ranges: [ranges[0]], priority: "low" })
    );
    jobs.push(
      read(transport, { url: "/high", ranges: [ranges[0]], priority: "high" })
    );
    expect(starts).toEqual(["/low0", "/low1", "/low2"]);
    completions.shift()!();
    await settle();
    expect(starts[3]).toBe("/high");
    while (completions.length) {
      completions.shift()!();
      await settle();
    }
    await Promise.all(jobs);
    expect(max).toBe(3);
    expect(starts[4]).toBe("/low3");
  });
  it("rejects mismatching multipart Content-Length and an already aborted empty read", async () => {
    const response = multi([
      { offset: 0, bytes: new Uint8Array(3) },
      { offset: 10, bytes: new Uint8Array(3) },
    ]);
    response.headers.set("Content-Length", "1");
    await expect(
      read(createAvifRangeTransport({ fetch: vi.fn(async () => response) }))
    ).rejects.toThrow("Content-Length mismatch");
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    await expect(
      read(createAvifRangeTransport({ fetch: fetcher }), {
        signal: controller.signal,
        ranges: [],
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reads a contiguous level above the multipart budget in one bounded response", async () => {
    const bytes = new Uint8Array(1_500_000);
    const onPart = vi.fn();
    const fetcher = vi.fn(async () => single(0, bytes, bytes.length));
    await read(createAvifRangeTransport({ fetch: fetcher }), {
      ranges: [{ offset: 0, length: bytes.length }],
      onPart,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onPart.mock.calls[0][1]).toEqual(bytes);
  });
  it("accepts nginx leading CRLF and a bounded MIME preamble across network chunks", async () => {
    const original = multi([
      { offset: 0, bytes: new Uint8Array([1, 2, 3]) },
      { offset: 10, bytes: new Uint8Array([4, 5, 6]) },
    ]);
    const reader = original.body!.getReader();
    let prefix = true;
    const response = new Response(
      new ReadableStream({
        async pull(controller) {
          if (prefix) {
            prefix = false;
            controller.enqueue(encode("\r\nMIME preamble\r\n"));
            return;
          }
          const next = await reader.read();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
        cancel() {
          return reader.cancel();
        },
      }),
      { status: 206, headers: original.headers }
    );
    const onPart = vi.fn();
    await read(
      createAvifRangeTransport({ fetch: vi.fn(async () => response) }),
      { onPart }
    );
    expect(onPart.mock.calls.map(([r]) => r.offset)).toEqual([0, 10]);
  });
  it("rejects unbounded or unterminated MIME preambles without a fallback", async () => {
    for (const body of ["preamble\r\n".repeat(1000), "no boundary\r\n"]) {
      const fetcher = vi.fn(
        async () =>
          new Response(body, {
            status: 206,
            headers: { "Content-Type": "multipart/byteranges; boundary=x" },
          })
      );
      const onPart = vi.fn();
      await expect(
        read(createAvifRangeTransport({ fetch: fetcher }), { onPart })
      ).rejects.toThrow();
      expect(onPart).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it.each(["range", "length"])(
    "publishes validated Single %s prefixes before the tail, independently owned",
    async (proof) => {
      let stream!: ReadableStreamDefaultController<Uint8Array>;
      const headers =
        proof === "range"
          ? { "Content-Range": "bytes 10-15/100" }
          : { "Content-Length": "6" };
      const response = new Response(
        new ReadableStream({
          start(c) {
            stream = c;
          },
        }),
        { status: 206, headers }
      );
      const onProgress = vi.fn(),
        onPart = vi.fn();
      const promise = read(
        createAvifRangeTransport({ fetch: vi.fn(async () => response) }),
        { ranges: [{ offset: 10, length: 6 }], onProgress, onPart }
      );
      await settle();
      const input = new Uint8Array([1, 2, 3]);
      stream.enqueue(input);
      await settle();
      expect(onProgress).toHaveBeenCalledWith(
        { offset: 10, length: 3 },
        new Uint8Array([1, 2, 3])
      );
      expect(onPart).not.toHaveBeenCalled();
      input.fill(0);
      onProgress.mock.calls[0][1].fill(9);
      stream.enqueue(new Uint8Array([4, 5, 6]));
      stream.close();
      await promise;
      expect(onProgress.mock.calls[1][0]).toEqual({ offset: 13, length: 3 });
      expect(onPart).toHaveBeenCalledWith(
        { offset: 10, length: 6 },
        new Uint8Array([1, 2, 3, 4, 5, 6])
      );
    }
  );
  it("does not stream unproven, mismatching-length, or short-discovery Singles", async () => {
    for (const [headers, allowShort] of [
      [{}, false],
      [{ "Content-Length": "3" }, false],
      [{ "Content-Length": "6" }, true],
    ] as const) {
      let stream!: ReadableStreamDefaultController<Uint8Array>;
      const onProgress = vi.fn();
      const response = new Response(
        new ReadableStream({
          start(c) {
            stream = c;
          },
        }),
        { status: 206, headers }
      );
      const promise = read(
        createAvifRangeTransport({ fetch: vi.fn(async () => response) }),
        { ranges: [{ offset: 0, length: 6 }], allowShort, onProgress }
      );
      const outcome = promise.catch((error) => error);
      await settle();
      stream.enqueue(new Uint8Array([1, 2, 3]));
      await settle();
      expect(onProgress).not.toHaveBeenCalled();
      stream.enqueue(new Uint8Array([4, 5, 6]));
      stream.close();
      const result = await outcome;
      if ("Content-Length" in headers && headers["Content-Length"] === "3")
        expect(result).toBeInstanceOf(Error);
      else expect(result).toBeUndefined();
      expect(onProgress).not.toHaveBeenCalled();
    }
  });
  it("keeps valid Single prefixes but never emits a complete part after tail abort", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const controller = new AbortController();
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              stream = c;
            },
            cancel,
          }),
          { status: 206, headers: { "Content-Length": "6" } }
        )
    );
    const onProgress = vi.fn(),
      onPart = vi.fn();
    const promise = read(createAvifRangeTransport({ fetch: fetcher }), {
      ranges: [{ offset: 0, length: 6 }],
      signal: controller.signal,
      onProgress,
      onPart,
    });
    const assertion = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    await settle();
    stream.enqueue(new Uint8Array([1, 2, 3]));
    await settle();
    controller.abort();
    await assertion;
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onPart).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("progress callback errors and invalid source ranges are fatal without fallback", async () => {
    const failure = new TypeError("consumer rejected prefix");
    const onProgress = vi.fn(() => {
      throw failure;
    });
    const fetcher = vi.fn(async () => single(0));
    const onPart = vi.fn();
    await expect(
      read(createAvifRangeTransport({ fetch: fetcher }), {
        ranges: [ranges[0]],
        onProgress,
        onPart,
      })
    ).rejects.toBe(failure);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onPart).not.toHaveBeenCalled();
    const invalidProgress = vi.fn();
    await expect(
      read(createAvifRangeTransport({ fetch: vi.fn(async () => single(1)) }), {
        ranges: [ranges[0]],
        onProgress: invalidProgress,
      })
    ).rejects.toThrow("Unrequested");
    expect(invalidProgress).not.toHaveBeenCalled();
  });
});
