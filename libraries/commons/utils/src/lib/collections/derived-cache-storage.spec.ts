import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type DerivedCacheCosts,
  type DerivedCacheRecord,
} from "./derived-cache-policy";
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
  const stores = new Map(
    ["metadata", "payload", "state"].map((name) => [
      name,
      new Map<string, unknown>(),
    ])
  );
  const failures: string[] = [];
  let payloadWrites = 0;
  let stateWriteFailures = 0;
  let transactions = 0;
  const transactionModes: string[] = [];
  const metadataQueries: unknown[] = [];
  const keyOf = (key: unknown) => JSON.stringify(key);
  const database = {
    close: vi.fn(),
    onversionchange: null,
    transaction: (_stores: readonly string[], mode: string) => {
      transactions += 1;
      transactionModes.push(mode);
      const staged = new Map(
        [...stores].map(([name, rows]) => [name, new Map(rows)])
      );
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
            getAll: (query?: { lower: unknown[]; upper: unknown[] }) =>
              enqueue(() => {
                if (name === "metadata") metadataQueries.push(query);
                const values = [...rows.values()];
                return query && name === "metadata"
                  ? values.filter(
                      (value) =>
                        (value as DerivedCacheRecord).namespace ===
                        query.lower[0]
                    )
                  : values;
              }),
            delete: (key: unknown) => enqueue(() => rows.delete(keyOf(key))),
            put: (value: unknown, key?: unknown) => {
              if (mode === "readonly")
                throw new DOMException(
                  "Read-only transaction",
                  "ReadOnlyError"
                );
              let errorName = name === "payload" ? failures.shift() : undefined;
              if (name === "state" && stateWriteFailures > 0) {
                stateWriteFailures--;
                errorName = "QuotaExceededError";
              }
              if (name === "payload") payloadWrites += 1;
              if (errorName && failureMode === "throw")
                throw new DOMException("Injected write failure", errorName);
              return enqueue((request) => {
                if (errorName) {
                  request.error = new DOMException(
                    "Injected write failure",
                    errorName
                  );
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
        const request: RequestStub = {
          result: undefined,
          error: null,
          onsuccess: null,
        };
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
  vi.stubGlobal("IDBKeyRange", {
    bound: (lower: unknown[], upper: unknown[]) => ({ lower, upper }),
  });
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = {
        result: database,
        onsuccess: null as (() => void) | null,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  return {
    failures,
    transactionModes,
    metadataQueries,
    failNextStateWrite: () => {
      stateWriteFailures++;
    },
    snapshot: () => [...stores].map(([name, rows]) => [name, [...rows]]),
    get payloadWrites() {
      return payloadWrites;
    },
    get transactions() {
      return transactions;
    },
  };
};

const record = (
  key: string,
  costs: DerivedCacheCosts = {
    recomputeMs: 100,
    restoreMs: 1,
  }
): DerivedCacheRecord => ({
  namespace: "terrain",
  key,
  version: "v1",
  bytes: 20,
  ...costs,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("derived tree storage", () => {
  it("admits exact parent chains and never removes a protected baseline or retained parent", async () => {
    const storage = installStorageStub();
    const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
    const registration = cache.register("terrain", "v1");
    const put = (node: string, parent: string | null, level: number) =>
      registration.put(node, node, {
        bytes: 20,
        recomputeMs: 100,
        restoreMs: 1,
        tree: { identity: "source/build", node, parent, level },
      });
    expect(await put("child", "root", 1)).toBe(false);
    expect(await put("root", null, 0)).toBe(true);
    expect(await put("child", "root", 1)).toBe(true);
    expect(
      await registration.get("child", {
        touch: false,
        tree: { identity: "other-source", node: "child" },
      })
    ).toBeNull();
    expect(await registration.remove("root")).toBe(false);
    expect(
      await registration.updateCosts("root", { recomputeMs: 1, restoreMs: 10 })
    ).toBe(false);
    expect(
      await registration.protectTree("source/build", ["child"], {
        replace: true,
      })
    ).toBe(true);
    expect(await registration.remove("child")).toBe(false);
    expect(await cache.trim()).toBe(0);
    expect(
      await registration.get("child", {
        touch: false,
        tree: { identity: "source/build", node: "child" },
      })
    ).not.toBeNull();
    expect(storage.transactionModes.at(-1)).toBe("readonly");
    expect(storage.metadataQueries.at(-1)).toEqual({
      lower: ["terrain"],
      upper: ["terrain", []],
    });
    expect((await registration.inspect())?.map((row) => row.hits ?? 0)).toEqual(
      [0, 0]
    );
    expect(await registration.markTreeUsed("other-source", ["child"])).toBe(0);
    expect(
      await registration.markTreeUsed("source/build", [
        "child",
        "child",
        "missing",
      ])
    ).toBe(1);
    expect((await registration.inspect())?.map((row) => row.hits ?? 0)).toEqual(
      [0, 1]
    );
    expect(await registration.get("child")).not.toBeNull();
    expect(storage.transactionModes.at(-1)).toBe("readwrite");
    expect(await cache.invalidateNamespace("terrain")).toBe(2);
    cache.close();
  });

  it("atomically publishes a complete baseline, preserving its previous manifest and protection on quota failure", async () => {
    const storage = installStorageStub();
    const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
    const registration = cache.register("terrain", "v1");
    for (const [node, parent, level] of [
      ["root", null, 0],
      ["old", "root", 1],
      ["new", "root", 1],
    ] as const) {
      expect(
        await registration.put(node, node, {
          bytes: 20,
          tree: { identity: "source/build", node, parent, level },
        })
      ).toBe(true);
    }
    const publish = (node: string) =>
      registration.protectTree("source/build", [node], {
        replace: true,
        manifest: { key: "manifest", bytes: 10, value: { nodes: [node] } },
      });
    expect(await publish("old")).toBe(true);
    expect(await publish("absent")).toBe(false);
    const before = storage.snapshot();
    storage.failures.push("QuotaExceededError");
    expect(await publish("new")).toBe(false);
    expect(storage.snapshot()).toEqual(before);
    expect(
      (
        await registration.get<{ nodes: string[] }>("manifest", {
          touch: false,
        })
      )?.value.nodes
    ).toEqual(["old"]);
    expect(await publish("new")).toBe(true);
    expect(
      (
        await registration.get<{ nodes: string[] }>("manifest", {
          touch: false,
        })
      )?.value.nodes
    ).toEqual(["new"]);
    expect(
      (await registration.inspect())
        ?.filter((row) => row.tree?.protected)
        .map((row) => row.key)
    ).toEqual(["root", "new", "manifest"]);
    expect(await cache.trim()).toBe(1);
    expect(await registration.get("manifest", { touch: false })).not.toBeNull();
    expect(
      await registration.put("foreign", 1, {
        bytes: 20,
        tree: {
          identity: "another-dataset/build",
          node: "root",
          parent: null,
          level: 0,
          protected: true,
        },
      })
    ).toBe(true);
    expect(await registration.invalidateTree("source/build")).toBe(3);
    expect(await registration.get("manifest", { touch: false })).toBeNull();
    expect((await registration.inspect())?.map((row) => row.key)).toEqual([
      "foreign",
    ]);
    cache.close();
  });
});

describe.each<FailureMode>(["throw", "request-error"])(
  "derived cache quota safety (%s)",
  (failureMode) => {
    it.each<DerivedCacheCosts>([{}, { recomputeMs: 100 }, { restoreMs: 1 }])(
      "does not trim or retry an unknown benefit %j",
      async (costs) => {
        const storage = installStorageStub(failureMode);
        const cache = createDerivedBufferCache({ capacityBytes: 1_000 });
        expect(await cache.put(record("valuable"), new Uint8Array([1]))).toBe(
          true
        );
        const before = storage.snapshot();
        const transactions = storage.transactions;
        storage.failures.push("QuotaExceededError");

        expect(
          await cache.put(record("probe", costs), new Uint8Array([2]))
        ).toBe(false);

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
      expect(
        await cache.put(record("cheap", { recomputeMs: 10, restoreMs: 1 }), 1)
      ).toBe(true);
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
      expect(
        await cache.put(record("cheap", { recomputeMs: 10, restoreMs: 1 }), 1)
      ).toBe(true);
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

describe("adaptive shared derived cache capacity", () => {
  it("uses fallback without waiting, then shares effective quota and entry limits", async () => {
    installStorageStub();
    let answer!: (value: StorageEstimate) => void;
    const estimate = vi.fn(
      () =>
        new Promise<StorageEstimate>((resolve) => {
          answer = resolve;
        })
    );
    vi.stubGlobal("navigator", { storage: { estimate } });
    const fallback = 256 * 1024 ** 2;
    const cache = createDerivedBufferCache({
      capacityBytes: fallback,
      adaptiveCapacity: true,
    });
    expect(await cache.stats()).toMatchObject({
      capacityBytes: fallback,
      configuredCapacityBytes: fallback,
      capacitySource: "configured-fallback",
      maxEntries: 4096,
    });
    answer({ quota: 10 * 1024 ** 3, usage: 2 * 1024 ** 3 });
    await vi.waitFor(async () =>
      expect(await cache.stats()).toMatchObject({
        capacityBytes: 7 * 1024 ** 3,
        capacitySource: "origin-quota",
      })
    );
    // Mutations publish the shared policy; stats/read paths never need a write.
    expect(await cache.put(record("sample-owner"), 1)).toBe(true);
    const other = createDerivedBufferCache({
      capacityBytes: fallback,
      adaptiveCapacity: true,
    });
    expect(await other.stats()).toMatchObject({
      capacityBytes: 7 * 1024 ** 3,
      maxEntries: 4096,
    });
    expect(estimate).toHaveBeenCalledTimes(1);
    cache.close();
    other.close();
  });

  it("keeps existing records readable when low origin space rejects new writes", async () => {
    installStorageStub();
    let answer!: (value: StorageEstimate) => void;
    vi.stubGlobal("navigator", {
      storage: {
        estimate: () =>
          new Promise<StorageEstimate>((resolve) => {
            answer = resolve;
          }),
      },
    });
    const cache = createDerivedBufferCache({
      capacityBytes: 1000,
      adaptiveCapacity: true,
    });
    expect(await cache.put(record("valuable"), 7)).toBe(true);
    answer({ quota: 1024 ** 3, usage: 1024 ** 3 });
    await vi.waitFor(async () =>
      expect((await cache.stats())?.capacityBytes).toBe(0)
    );
    expect(await cache.put(record("new"), 9)).toBe(false);
    expect((await cache.get<number>("terrain", "valuable", "v1"))?.value).toBe(
      7
    );
    expect((await cache.stats())?.count).toBe(1);
    cache.close();
  });

  it.each<FailureMode>(["throw", "request-error"])(
    "invalidates a quota estimate on %s without adding unknown-benefit eviction",
    async (failureMode) => {
      const storage = installStorageStub(failureMode);
      const estimate = vi.fn(async () => ({ quota: 10 * 1024 ** 3, usage: 0 }));
      vi.stubGlobal("navigator", { storage: { estimate } });
      const cache = createDerivedBufferCache({
        capacityBytes: 1000,
        adaptiveCapacity: true,
      });
      expect(await cache.put(record("valuable"), 7)).toBe(true);
      await vi.waitFor(async () =>
        expect((await cache.stats())?.capacitySource).toBe("origin-quota")
      );
      storage.failures.push("QuotaExceededError");
      expect(await cache.put(record("unknown", {}), 9)).toBe(false);
      await cache.stats();
      await vi.waitFor(() => expect(estimate).toHaveBeenCalledTimes(2));
      expect((await cache.stats())?.count).toBe(1);
      expect(
        (await cache.get<number>("terrain", "valuable", "v1"))?.value
      ).toBe(7);
      cache.close();
    }
  );
});

describe("quota refresh preserves readable derived data", () => {
  it("does not evict a large cache during refresh or a transient estimate failure", async () => {
    installStorageStub();
    let now = 1;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let answer!: (value: StorageEstimate) => void;
    const estimate = vi
      .fn()
      .mockResolvedValueOnce({ quota: 10 * 1024 ** 3, usage: 1024 ** 3 })
      .mockImplementationOnce(
        () =>
          new Promise<StorageEstimate>((resolve) => {
            answer = resolve;
          })
      );
    vi.stubGlobal("navigator", { storage: { estimate } });
    const cache = createDerivedBufferCache({
      capacityBytes: 256 * 1024 ** 2,
      adaptiveCapacity: true,
    });
    await vi.waitFor(async () =>
      expect((await cache.stats())?.capacitySource).toBe("origin-quota")
    );
    expect(
      await cache.put({ ...record("large"), bytes: 512 * 1024 ** 2 }, 7)
    ).toBe(true);
    now += 60_001;
    expect(
      await cache.put({ ...record("during-refresh"), bytes: 1024 ** 2 }, 8)
    ).toBe(true);
    expect((await cache.stats())?.count).toBe(2);
    answer({});
    await vi.waitFor(async () =>
      expect((await cache.stats())?.capacitySource).toBe("configured-fallback")
    );
    expect(
      await cache.put({ ...record("after-failure"), bytes: 1024 ** 2 }, 9)
    ).toBe(false);
    expect((await cache.stats())?.count).toBe(2);
    expect(
      (await cache.get<number>("terrain", "large", "v1", { touch: false }))
        ?.value
    ).toBe(7);
    cache.close();
  });

  it.each<FailureMode>(["throw", "request-error"])(
    "does not make an untouching read depend on an optional state write (%s)",
    async (failureMode) => {
      const storage = installStorageStub(failureMode);
      let answer!: (value: StorageEstimate) => void;
      vi.stubGlobal("navigator", {
        storage: {
          estimate: () =>
            new Promise<StorageEstimate>((resolve) => {
              answer = resolve;
            }),
        },
      });
      const cache = createDerivedBufferCache({
        capacityBytes: 1000,
        adaptiveCapacity: true,
      });
      expect(await cache.put(record("valuable"), 7)).toBe(true);
      answer({ quota: 10 * 1024 ** 3, usage: 0 });
      await vi.waitFor(async () =>
        expect((await cache.stats())?.capacitySource).toBe("origin-quota")
      );
      storage.failNextStateWrite();
      expect(
        (await cache.get<number>("terrain", "valuable", "v1", { touch: false }))
          ?.value
      ).toBe(7);
      expect((await cache.inspect())?.length).toBe(1);
      // The injected failure is still armed and affects an actual mutation.
      expect(await cache.put(record("new", {}), 9)).toBe(false);
      cache.close();
    }
  );
});
