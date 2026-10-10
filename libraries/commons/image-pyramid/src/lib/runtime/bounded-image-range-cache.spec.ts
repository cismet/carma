// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";

const imageUrl = "https://example.org/2026/RI_01_1234.avif";
const keyOf = (
  source: string,
  offset: number,
  length: number,
  version = "etag-v1",
  saved = 1
) => {
  const key = new URL(
    "https://cache.carma.invalid/image-ranges/" + encodeURIComponent(source)
  );
  key.searchParams.set("version", version);
  key.searchParams.set("offset", String(offset));
  key.searchParams.set("length", String(length));
  key.searchParams.set("saved", String(saved));
  return key.href;
};

const fakeStorage = () => {
  const entries = new Map<string, Response>();
  const cache = {
    keys: vi.fn(async () => [...entries.keys()].map((url) => new Request(url))),
    match: vi.fn(async (key: string) => entries.get(key)?.clone()),
    put: vi.fn(async (key: string, response: Response) => {
      if (response.status === 206) throw new TypeError("Partial response");
      entries.set(key, response.clone());
    }),
    delete: vi.fn(async (key: string) => entries.delete(key)),
  };
  const storage = { open: vi.fn(async () => cache) };
  vi.stubGlobal("caches", storage);
  return { entries, cache, storage };
};

const signal = () => new AbortController().signal;

// Minimal transaction-order stub, following the shared derived-cache tests.
// It exercises adapter logic; native browser storage is checked separately.
const fakeIndexedDb = () => {
  const entries = new Map<string, Blob>();
  let created = false;
  const database = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => {
      created = true;
    },
    close: vi.fn(),
    onversionchange: null,
    transaction: () => {
      const tx = {
        error: null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          getAllKeys: () => enqueue(() => [...entries.keys()]),
          get: (key: string) => enqueue(() => entries.get(key)),
          put: (body: Blob, key: string) =>
            enqueue(() => entries.set(key, body)),
          delete: (key: string) => enqueue(() => entries.delete(key)),
        }),
      };
      const enqueue = (action: () => unknown) => {
        const request = { result: undefined as unknown, error: null };
        queueMicrotask(() => {
          request.result = action();
          queueMicrotask(() => tx.oncomplete?.());
        });
        return request;
      };
      return tx;
    },
  };
  const factory = {
    open: vi.fn(() => {
      const request = {
        result: database,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }),
  };
  vi.stubGlobal("caches", undefined);
  vi.stubGlobal("indexedDB", factory);
  return { entries, factory };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("persistent compressed image ranges", () => {
  it("persists every part of a multipart burst and snapshots caller-owned bytes", async () => {
    const { cache } = fakeStorage();
    const store = new BoundedImageRangeCache(imageUrl);
    const parts = Array.from(
      { length: 24 },
      (_, index) => new Uint8Array([index, 99])
    );
    const writes = parts.map((part, index) =>
      store.put(index * 10, part, "v1")
    );
    parts.forEach((part) => part.fill(255));
    await Promise.all(writes);
    expect(cache.put).toHaveBeenCalledTimes(24);
    for (let index = 0; index < 24; index++) {
      expect(await store.get(index * 10, 2, "v1", signal())).toEqual(
        new Uint8Array([index, 99])
      );
    }
  });

  it("bounds pending bytes across sources even after caller deadlines, then recovers", async () => {
    vi.useFakeTimers();
    const { cache, storage } = fakeStorage();
    let resume!: () => void;
    storage.open.mockImplementation(
      () =>
        new Promise((resolve) => {
          resume = () => resolve(cache);
        })
    );
    const stores = [
      new BoundedImageRangeCache(imageUrl),
      new BoundedImageRangeCache(imageUrl + "?second"),
    ];
    const MiB = 1024 * 1024;
    const writes = Array.from({ length: 8 }, (_, index) =>
      stores[index % 2].put(index * MiB, new Uint8Array(MiB), "v1")
    );
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(writes);
    // Timed-out callers leave eight MiB queued, so another byte is refused.
    await stores[0].put(20 * MiB, new Uint8Array([9]), "v1");
    expect(cache.put).not.toHaveBeenCalled();
    resume();
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledTimes(8));
    await stores[0].put(21 * MiB, new Uint8Array([7]), "v1");
    expect(await stores[0].get(20 * MiB, 1, "v1", signal())).toBeUndefined();
    expect(await stores[0].get(21 * MiB, 1, "v1", signal())).toEqual(
      new Uint8Array([7])
    );
  });

  it("bounds tiny queued parts by count while storage is blocked and releases failed writes", async () => {
    vi.useFakeTimers();
    const { cache } = fakeStorage();
    let resume!: () => void;
    cache.put.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          resume = () => reject(new Error("Storage unavailable"));
        })
    );
    const store = new BoundedImageRangeCache(imageUrl);
    const writes = Array.from({ length: 80 }, (_, index) =>
      store.put(index * 10, new Uint8Array([index]), "v1")
    );
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(writes);
    expect(cache.put).toHaveBeenCalledTimes(1);
    await store.put(900, new Uint8Array([90]), "v1");
    resume();
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledTimes(64));
    expect(await store.get(630, 1, "v1", signal())).toEqual(
      new Uint8Array([63])
    );
    expect(await store.get(640, 1, "v1", signal())).toBeUndefined();
    expect(await store.get(900, 1, "v1", signal())).toBeUndefined();
    await store.put(910, new Uint8Array([91]), "v1");
    expect(await store.get(910, 1, "v1", signal())).toEqual(
      new Uint8Array([91])
    );
  });

  it("stores partial network data as HTTP 200 and reads covered ranges", async () => {
    const { cache } = fakeStorage();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const store = new BoundedImageRangeCache(imageUrl);
    await store.put(100, new Uint8Array([1, 2, 3, 4, 5, 6]), "etag-v1");
    expect(await store.get(102, 3, "etag-v1", signal())).toEqual(
      new Uint8Array([3, 4, 5])
    );
    const [, response] = cache.put.mock.calls[0];
    expect(response.status).toBe(200);
    expect(cache.put.mock.calls[0][0]).toMatch(
      /^https:\/\/cache\.carma\.invalid\//
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(await store.get(99, 3, "etag-v1", signal())).toBeUndefined();
    expect(await store.get(104, 3, "etag-v1", signal())).toBeUndefined();
  });

  it("isolates source URLs, their query parameters and validator versions", async () => {
    fakeStorage();
    const store = new BoundedImageRangeCache(imageUrl);
    await store.put(0, new Uint8Array([1, 2, 3]), "etag-v1");
    expect(await store.get(0, 3, "etag-v2", signal())).toBeUndefined();
    expect(
      await new BoundedImageRangeCache(imageUrl + "?edition=2").get(
        0,
        3,
        "etag-v1",
        signal()
      )
    ).toBeUndefined();
    await store.put(0, new Uint8Array([4, 5, 6]), "etag-v2");
    expect(await store.get(0, 3, "etag-v2", signal())).toEqual(
      new Uint8Array([4, 5, 6])
    );
    expect(await store.get(0, 3, "etag-v1", signal())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("inventories the cache once and restores prior session ranges", async () => {
    const { cache, entries } = fakeStorage();
    entries.set(
      keyOf(imageUrl, 100, 4),
      new Response(new Uint8Array([1, 2, 3, 4]))
    );
    const store = new BoundedImageRangeCache(imageUrl);
    expect(await store.get(101, 2, "etag-v1", signal())).toEqual(
      new Uint8Array([2, 3])
    );
    await store.put(200, new Uint8Array([5, 6]), "etag-v1");
    await new BoundedImageRangeCache(imageUrl).get(200, 2, "etag-v1", signal());
    expect(cache.keys).toHaveBeenCalledTimes(1);
  });

  it("refreshes expired inventories once across sources without reading bodies or probing HTTP", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { cache, entries } = fakeStorage();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const source = new BoundedImageRangeCache(imageUrl);
    const other = new BoundedImageRangeCache(imageUrl + "?edition=2");
    entries.set(keyOf(imageUrl, 100, 4), new Response(new Uint8Array(4)));
    await source.ensureKnownRanges(signal());
    expect(source.knownRanges("etag-v1")?.ranges).toEqual([
      { offset: 100, length: 4 },
    ]);
    expect(cache.keys).toHaveBeenCalledOnce();
    vi.setSystemTime(61_001);
    entries.clear();
    entries.set(keyOf(imageUrl, 200, 4), new Response(new Uint8Array(4)));
    expect(source.knownRanges("etag-v1")).toBeUndefined();
    await Promise.all([
      source.ensureKnownRanges(signal()),
      other.ensureKnownRanges(signal()),
    ]);
    expect(cache.keys).toHaveBeenCalledTimes(2);
    expect(source.knownRanges("etag-v1")?.ranges).toEqual([
      { offset: 200, length: 4 },
    ]);
    await source.ensureKnownRanges(signal());
    expect(cache.keys).toHaveBeenCalledTimes(2);
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds a stalled inventory refresh and propagates caller cancellation", async () => {
    const { cache } = fakeStorage();
    const source = new BoundedImageRangeCache(imageUrl);
    await source.ensureKnownRanges(signal());
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_001);
    cache.keys.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const cancelled = source.ensureKnownRanges(controller.signal);
    const rejected = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    const stalled = source.ensureKnownRanges(signal());
    await vi.advanceTimersByTimeAsync(100);
    await expect(stalled).resolves.toBeUndefined();
    expect(source.knownRanges("etag-v1")).toBeUndefined();
    expect(cache.keys).toHaveBeenCalledTimes(2);
  });

  it("fails open with disabled or failing storage and does not store unversioned data", async () => {
    vi.stubGlobal("caches", undefined);
    const store = new BoundedImageRangeCache(imageUrl);
    expect(await store.get(0, 1, "v1", signal())).toBeUndefined();
    await expect(
      store.put(0, new Uint8Array([1]), "v1")
    ).resolves.toBeUndefined();
    vi.stubGlobal("caches", {
      open: vi.fn().mockRejectedValue(new Error("Storage disabled")),
    });
    expect(await store.get(0, 1, "v1", signal())).toBeUndefined();
    await expect(
      store.put(0, new Uint8Array([1]), "v1")
    ).resolves.toBeUndefined();
    const { storage } = fakeStorage();
    await store.put(0, new Uint8Array([1]), "");
    expect(await store.get(0, 1, "", signal())).toBeUndefined();
    expect(storage.open).not.toHaveBeenCalled();
  });

  it("returns after 100 ms when storage opening stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("caches", { open: () => new Promise(() => undefined) });
    const store = new BoundedImageRangeCache(imageUrl);
    const read = store.get(0, 1, "v1", signal());
    const write = store.put(0, new Uint8Array([1]), "v1");
    await vi.advanceTimersByTimeAsync(100);
    expect(await read).toBeUndefined();
    await expect(write).resolves.toBeUndefined();
  });

  it("includes cached body reads in the 100 ms deadline", async () => {
    const { cache } = fakeStorage();
    const store = new BoundedImageRangeCache(imageUrl);
    await store.put(0, new Uint8Array([1]), "v1");
    cache.match.mockImplementation(async () => {
      const response = new Response(new Uint8Array([1]));
      vi.spyOn(response, "blob").mockImplementation(
        () => new Promise(() => undefined)
      );
      return response;
    });
    vi.useFakeTimers();
    const read = store.get(0, 1, "v1", signal());
    await vi.advanceTimersByTimeAsync(100);
    expect(await read).toBeUndefined();
  });

  it("propagates caller cancellation immediately during a storage read", async () => {
    vi.stubGlobal("caches", { open: () => new Promise(() => undefined) });
    const controller = new AbortController();
    const read = new BoundedImageRangeCache(imageUrl).get(
      0,
      1,
      "v1",
      controller.signal
    );
    const rejection = expect(read).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejection;
    await expect(
      new BoundedImageRangeCache(imageUrl).get(0, 1, "v1", controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("evicts the oldest identity after eight sources without per-write key scans", async () => {
    const { cache, entries } = fakeStorage();
    for (let index = 0; index < 9; index++) {
      await new BoundedImageRangeCache(imageUrl + "?photo=" + index).put(
        0,
        new Uint8Array([index]),
        "v1"
      );
    }
    expect(entries.size).toBe(8);
    expect(cache.keys).toHaveBeenCalledTimes(1);
    expect(
      await new BoundedImageRangeCache(imageUrl + "?photo=0").get(
        0,
        1,
        "v1",
        signal()
      )
    ).toBeUndefined();
    expect(
      await new BoundedImageRangeCache(imageUrl + "?photo=8").get(
        0,
        1,
        "v1",
        signal()
      )
    ).toEqual(new Uint8Array([8]));
  });

  it("bounds global compressed bytes using the stored extent index", async () => {
    const { cache, entries } = fakeStorage();
    // Inventory lengths exercise eviction without allocating a 256 MiB fixture.
    for (let index = 0; index < 33; index++)
      entries.set(
        keyOf(imageUrl, index * 8 * 1024 * 1024, 8 * 1024 * 1024, "v1", index),
        new Response()
      );
    await new BoundedImageRangeCache(imageUrl).put(
      300 * 1024 * 1024,
      new Uint8Array([1]),
      "v1"
    );
    const bytes = [...entries.keys()].reduce(
      (sum, key) => sum + Number(new URL(key).searchParams.get("length")),
      0
    );
    expect(bytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    expect(cache.keys).toHaveBeenCalledTimes(1);
  });

  it("handles quota errors and corrupted persisted bodies without affecting the caller", async () => {
    const { cache, entries } = fakeStorage();
    const store = new BoundedImageRangeCache(imageUrl);
    await store.put(0, new Uint8Array([1, 2, 3]), "v1");
    cache.put.mockRejectedValueOnce(
      new DOMException("Quota", "QuotaExceededError")
    );
    await expect(
      store.put(10, new Uint8Array([4]), "v1")
    ).resolves.toBeUndefined();
    expect(entries.size).toBe(0);
    await store.put(20, new Uint8Array([5, 6]), "v1");
    const key = [...entries.keys()][0];
    entries.set(key, new Response(new Uint8Array([5])));
    expect(await store.get(20, 1, "v1", signal())).toBeUndefined();
  });

  it("persists Blob ranges through IndexedDB on insecure LAN HTTP with source/version isolation", async () => {
    const { entries, factory } = fakeIndexedDb();
    const url = "http://192.0.2.10:4201/images/photo.avif";
    const first = new BoundedImageRangeCache(url);
    await first.put(100, new Uint8Array([1, 2, 3, 4]), "v1");
    expect([...entries.values()][0]).toBeInstanceOf(Blob);
    // A separate backend wrapper recreates the in-memory index as after reload.
    vi.stubGlobal("indexedDB", { ...factory });
    const restored = new BoundedImageRangeCache(url);
    expect(await restored.get(101, 2, "v1", signal())).toEqual(
      new Uint8Array([2, 3])
    );
    expect(await restored.get(101, 2, "v2", signal())).toBeUndefined();
    expect(
      await new BoundedImageRangeCache(url + "?other=1").get(
        101,
        2,
        "v1",
        signal()
      )
    ).toBeUndefined();
  });

  it("uses IndexedDB when an exposed CacheStorage rejects opening", async () => {
    fakeIndexedDb();
    vi.stubGlobal("caches", {
      open: vi.fn().mockRejectedValue(new Error("Disabled")),
    });
    const store = new BoundedImageRangeCache(imageUrl);
    await store.put(20, new Uint8Array([5, 6]), "v1");
    expect(await store.get(20, 2, "v1", signal())).toEqual(
      new Uint8Array([5, 6])
    );
  });

  it("fails open for unavailable, blocked or stalled IndexedDB within 100 ms", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("indexedDB", undefined);
    expect(
      await new BoundedImageRangeCache(imageUrl).get(0, 1, "v1", signal())
    ).toBeUndefined();
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw Error("Disabled");
      },
    });
    expect(
      await new BoundedImageRangeCache(imageUrl).get(0, 1, "v1", signal())
    ).toBeUndefined();
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = { onblocked: null as (() => void) | null };
        queueMicrotask(() => request.onblocked?.());
        return request;
      },
    });
    expect(
      await new BoundedImageRangeCache(imageUrl).get(0, 1, "v1", signal())
    ).toBeUndefined();
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    const read = new BoundedImageRangeCache(imageUrl).get(0, 1, "v1", signal());
    await vi.advanceTimersByTimeAsync(100);
    expect(await read).toBeUndefined();
  });
});
