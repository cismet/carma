import { afterEach, describe, expect, it, vi } from "vitest";

import { type DerivedCacheCosts, type DerivedCacheRecord } from "./derived-cache-policy";
import { createDerivedBufferCache } from "./derived-cache-storage";

type FailureMode = "throw" | "request-error";
type RequestStub = {
  result: unknown;
  error: DOMException | null;
  onsuccess: (() => void) | null;
};

// A deliberately bounded transaction stub, not an IndexedDB implementation:
// queued requests, commit/abort rollback and injected payload-write failures.
// Native quota exhaustion remains a separate browser-test responsibility.
const installStorageStub = (failureMode: FailureMode = "request-error") => {
  const stores = new Map(["metadata", "payload", "state"].map(
    (name) => [name, new Map<string, unknown>()]
  ));
  const failures: string[] = [];
  let payloadWrites = 0;
  let transactions = 0;
  const keyOf = (key: unknown) => JSON.stringify(key);
  const database = {
    close: vi.fn(),
    onversionchange: null,
    transaction: () => {
      transactions += 1;
      const staged = new Map([...stores].map(([name, rows]) => [name, new Map(rows)]));
      let pending = 0;
      let ended = false;
      const tx = {
        error: null as DOMException | null,
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as ((event: { target: RequestStub }) => void) | null,
        abort: () => {
          if (ended) return;
          ended = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore: (name: string) => {
          const rows = staged.get(name)!;
          return {
            get: (key: unknown) => enqueue(() => rows.get(keyOf(key))),
            getAll: () => enqueue(() => [...rows.values()]),
            delete: (key: unknown) => enqueue(() => rows.delete(keyOf(key))),
            put: (value: unknown, key?: unknown) => {
              const errorName = name === "payload" ? failures.shift() : undefined;
              if (name === "payload") payloadWrites += 1;
              if (errorName && failureMode === "throw")
                throw new DOMException("Injected write failure", errorName);
              return enqueue((request) => {
                if (errorName) {
                  request.error = new DOMException("Injected write failure", errorName);
                  // Deliberately leave tx.error null: browsers can surface the
                  // quota error on the request before the transaction abort.
                  tx.onerror?.({ target: request });
                  tx.abort();
                  return;
                }
                const record = value as DerivedCacheRecord;
                rows.set(keyOf(key ?? [record.namespace, record.key]), value);
              });
            },
          };
        },
      };
      const enqueue = (operation: (request: RequestStub) => unknown) => {
        const request: RequestStub = { result: undefined, error: null, onsuccess: null };
        pending += 1;
        queueMicrotask(() => {
          if (ended) return;
          request.result = operation(request);
          if (!ended) request.onsuccess?.();
          pending -= 1;
          if (!ended && pending === 0) {
            ended = true;
            for (const [name, rows] of staged) stores.set(name, rows);
            tx.oncomplete?.();
          }
        });
        return request;
      };
      return tx;
    },
  };
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = { result: database, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return {
    failures,
    snapshot: () => [...stores].map(([name, rows]) => [name, [...rows]]),
    get payloadWrites() { return payloadWrites; },
    get transactions() { return transactions; },
  };
};

const record = (key: string, costs: DerivedCacheCosts = {
  recomputeMs: 100, restoreMs: 1,
}): DerivedCacheRecord => ({
  namespace: "terrain", key, version: "v1", bytes: 20, ...costs,
});

afterEach(() => vi.unstubAllGlobals());

describe.each<FailureMode>(["throw", "request-error"])(
  "derived cache quota safety (%s)", (failureMode) => {
    it.each<DerivedCacheCosts>([{}, { recomputeMs: 100 }, { restoreMs: 1 }])(
      "does not trim or retry an unknown benefit %j", async (costs) => {
        const storage = installStorageStub(failureMode);
        const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
        expect(await cache.put(record("valuable"), new Uint8Array([1]))).toBe(true);
        const before = storage.snapshot();
        const transactions = storage.transactions;
        storage.failures.push("QuotaExceededError");

        expect(await cache.put(record("probe", costs), new Uint8Array([2]))).toBe(false);

        expect(storage.transactions - transactions).toBe(1);
        expect(storage.payloadWrites).toBe(2);
        expect(storage.snapshot()).toEqual(before);
        cache.close();
      }
    );

    it("allows an unknown benefit without eviction when the write succeeds", async () => {
      const storage = installStorageStub(failureMode);
      const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
      expect(await cache.put(record("valuable"), 1)).toBe(true);
      expect(await cache.put(record("probe", {}), 2)).toBe(true);
      expect(storage.payloadWrites).toBe(2);
      expect((await cache.get("terrain", "valuable", "v1"))?.value).toBe(1);
      expect((await cache.get("terrain", "probe", "v1"))?.value).toBe(2);
      cache.close();
    });

    it("trims once and retries a measured candidate after quota failure", async () => {
      const storage = installStorageStub(failureMode);
      const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
      expect(await cache.put(record("cheap", { recomputeMs: 10, restoreMs: 1 }), 1)).toBe(true);
      expect(await cache.put(record("valuable"), 2)).toBe(true);
      const transactions = storage.transactions;
      storage.failures.push("QuotaExceededError");

      expect(await cache.put(record("replacement"), 3)).toBe(true);

      expect(storage.transactions - transactions).toBe(3);
      expect(storage.payloadWrites).toBe(4);
      expect(await cache.get("terrain", "cheap", "v1")).toBeNull();
      expect((await cache.get("terrain", "valuable", "v1"))?.value).toBe(2);
      expect((await cache.get("terrain", "replacement", "v1"))?.value).toBe(3);
      cache.close();
    });

    it("does not repeat the trim when the measured candidate's retry also fails", async () => {
      const storage = installStorageStub(failureMode);
      const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
      expect(await cache.put(record("cheap", { recomputeMs: 10, restoreMs: 1 }), 1)).toBe(true);
      expect(await cache.put(record("valuable"), 2)).toBe(true);
      const transactions = storage.transactions;
      storage.failures.push("QuotaExceededError", "QuotaExceededError");

      expect(await cache.put(record("replacement"), 3)).toBe(false);

      expect(storage.transactions - transactions).toBe(3);
      expect(storage.payloadWrites).toBe(4);
      expect((await cache.get("terrain", "valuable", "v1"))?.value).toBe(2);
      expect(await cache.get("terrain", "replacement", "v1")).toBeNull();
      cache.close();
    });

    it("does not evict on other write errors", async () => {
      const storage = installStorageStub(failureMode);
      const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
      expect(await cache.put(record("valuable"), 1)).toBe(true);
      const before = storage.snapshot();
      const transactions = storage.transactions;
      storage.failures.push("DataCloneError");

      expect(await cache.put(record("replacement"), 2)).toBe(false);

      expect(storage.transactions - transactions).toBe(1);
      expect(storage.snapshot()).toEqual(before);
      cache.close();
    });

    it("does not retry when there is nothing owned to trim", async () => {
      const storage = installStorageStub(failureMode);
      const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
      storage.failures.push("QuotaExceededError");

      expect(await cache.put(record("replacement"), 1)).toBe(false);

      expect(storage.transactions).toBe(2);
      expect(storage.payloadWrites).toBe(1);
      cache.close();
    });
  }
);
