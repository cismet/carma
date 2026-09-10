import {
  DERIVED_CACHE_DEFAULTS,
  derivedCacheSavedMilliseconds,
  isDerivedCacheRecordValid,
  isDerivedCacheSavingSufficient,
  planDerivedCacheAdmission,
  planDerivedCacheTrim,
  refreshDerivedCacheMetadata,
  resolveDerivedCachePolicy,
  type DerivedCacheCosts,
  type DerivedCacheMetadata,
  type DerivedCachePolicyOptions,
  type DerivedCacheRecord,
} from "./derived-cache-policy";

const STORES = { metadata: "metadata", payload: "payload", state: "state" } as const;
const STATE_KEY = "budget";
const READ_WRITE = "readwrite";
const isQuotaError = (error: unknown) =>
  typeof error === "object" && error !== null && "name" in error &&
  error.name === "QuotaExceededError";
type Policy = NonNullable<ReturnType<typeof resolveDerivedCachePolicy>>;
type BudgetState = Policy & { age: number; bytes: number; count: number };
export type DerivedBufferCacheOptions = DerivedCachePolicyOptions & Readonly<{
  databaseName?: string;
  producerEpoch?: string;
  enabled?: boolean;
}>;
export type DerivedBufferCacheStats = Readonly<BudgetState>;
export type DerivedBufferCacheValue<T> = Readonly<{
  value: T;
  metadata: DerivedCacheMetadata;
}>;

// Canonical tuples reserve a disjoint physical namespace domain. Legacy
// managers cannot address these tuples as if they were unscoped namespaces.
const parseEpochNamespace = (namespace: string): [string, string] | null => {
  if (!namespace.startsWith("[")) return null;
  try {
    const pair: unknown = JSON.parse(namespace);
    return Array.isArray(pair) && pair.length === 2 &&
      pair.every(value => typeof value === "string" && value.length > 0) &&
      JSON.stringify(pair) === namespace ? pair as [string, string] : null;
  } catch { return null; }
};

/** DBC-01: ./DERIVED_CACHE_DECISIONS.md. Invoke from a worker for large buffers.
 * Native structured cloning only; bytes describe caller-accounted payload, not
 * exact IndexedDB overhead. Disk capacity is unrelated to GPU/RAM budgets.
 * The first operation persists the shared policy; mismatched clients fail closed.
 * Producer epochs isolate records, not budgets. Only idle callers should request
 * obsolete-epoch cleanup; live cooperative clients retain shared Web Lock leases.
 * Without Web Locks persistence remains isolated but automatic cleanup is off.
 */
export const createDerivedBufferCache = (
  options: DerivedBufferCacheOptions
) => {
  const policy = resolveDerivedCachePolicy(options);
  const epoch = options.producerEpoch ?? null;
  const enabled = options.enabled !== false &&
    (options.producerEpoch === undefined || typeof options.producerEpoch === "string" && options.producerEpoch.length > 0);
  const databaseName = options.databaseName ?? DERIVED_CACHE_DEFAULTS.databaseName;
  const physicalNamespace = (namespace: string) => {
    if (typeof namespace !== "string" || namespace.length === 0) return null;
    return epoch !== null ? JSON.stringify([epoch, namespace])
      : parseEpochNamespace(namespace) ? null : namespace;
  };
  const logicalNamespace = (namespace: string) => {
    const pair = parseEpochNamespace(namespace);
    return pair ? pair[0] === epoch ? pair[1] : null
      : epoch === null ? namespace : null;
  };
  const isOwnRecord = (record: DerivedCacheMetadata) => logicalNamespace(record.namespace) !== null;
  const publicMetadata = (record: DerivedCacheMetadata): DerivedCacheMetadata => ({
    ...record, namespace: logicalNamespace(record.namespace)!,
  });
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase | null> | null = null;
  let closed = false;
  let locks: LockManager | undefined;
  try { if (enabled && typeof navigator !== "undefined") locks = navigator.locks; } catch { /* No cleanup without locks. */ }
  if (typeof locks?.request !== "function") locks = undefined;
  const leaseName = (producer: string | null) =>
    `carma-derived-cache-epoch:${JSON.stringify([databaseName, producer])}`;
  let leaseReady: Promise<boolean> | null = null;
  let leaseAbort: AbortController | null = null;
  let releaseLease: (() => void) | null = null;
  const acquireLease = (): Promise<boolean> => {
    if (closed || !enabled) return Promise.resolve(false);
    if (!locks) return Promise.resolve(true);
    leaseReady ??= new Promise<boolean>((resolve) => {
      const controller = new AbortController();
      leaseAbort = controller;
      try {
        void locks!.request(leaseName(epoch), { mode: "shared", signal: controller.signal }, async () => {
          leaseAbort = null;
          if (closed) { resolve(false); return; }
          const held = new Promise<void>((release) => { releaseLease = release; });
          resolve(true);
          await held;
          releaseLease = null;
        }).catch(() => resolve(false));
      } catch { resolve(false); }
    });
    return leaseReady;
  };
  const quotaFailures = new WeakSet<IDBTransaction>();
  const open = async (): Promise<IDBDatabase | null> => {
    if (closed || !enabled || !policy || typeof indexedDB === "undefined") return null;
    if (!await acquireLease() || closed) return null;
    if (database) return database;
    opening ??= new Promise<IDBDatabase | null>((resolve) => {
      let settled = false;
      const finish = (value: IDBDatabase | null) => {
        if (settled) {
          value?.close();
          return;
        }
        settled = true;
        resolve(value);
      };
      try {
        const request = indexedDB.open(
          databaseName,
          1
        );
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORES.metadata))
            db.createObjectStore(STORES.metadata, { keyPath: ["namespace", "key"] });
          for (const name of [STORES.payload, STORES.state])
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        };
        request.onerror = request.onblocked = () => finish(null);
        request.onsuccess = () => {
          if (closed || settled) {
            request.result.close();
            finish(null);
            return;
          }
          const connection = request.result;
          database = connection;
          connection.onversionchange = () => {
            connection.close();
            if (database === connection) database = null;
          };
          finish(database);
        };
      } catch {
        finish(null);
      }
    }).finally(() => {
      opening = null;
    });
    return opening;
  };
  const run = async <T>(
    fallback: T,
    action: (
      tx: IDBTransaction,
      state: BudgetState,
      done: (value: T) => void
    ) => void,
    onQuota?: () => void
  ): Promise<T> => {
    const db = await open();
    if (!db || !policy || closed) return fallback;
    return new Promise<T>((resolve) => {
      let result = fallback;
      try {
        const tx = db.transaction(Object.values(STORES), READ_WRITE);
        tx.oncomplete = () => resolve(result);
        tx.onerror = (event) => {
          if (isQuotaError((event.target as IDBRequest | null)?.error))
            quotaFailures.add(tx);
        };
        tx.onabort = () => {
          if (isQuotaError(tx.error) || quotaFailures.has(tx)) onQuota?.();
          resolve(fallback);
        };
        read(tx, tx.objectStore(STORES.state).get(STATE_KEY), (stored) => {
          const state: BudgetState = stored ?? {
            ...policy, age: 0, bytes: 0, count: 0,
          };
          if (
            state.capacityBytes !== policy.capacityBytes ||
            state.maxEntries !== policy.maxEntries ||
            state.lowWaterRatio !== policy.lowWaterRatio ||
            state.minimumSavingRatio !== policy.minimumSavingRatio
          ) return;
          if (!stored) tx.objectStore(STORES.state).put(state, STATE_KEY);
          action(tx, state, (value) => {
            result = value;
          });
        });
      } catch (error) {
        if (isQuotaError(error)) onQuota?.();
        resolve(fallback);
      }
    });
  };
  // Only request callbacks enqueue further work: no awaited transaction gaps.
  const read = <T>(
    tx: IDBTransaction,
    request: IDBRequest<T>,
    use: (value: T) => void
  ) => {
    request.onsuccess = () => {
      try {
        use(request.result);
      } catch (error) {
        if (isQuotaError(error)) quotaFailures.add(tx);
        tx.abort();
      }
    };
  };
  const allMetadata = (
    tx: IDBTransaction,
    use: (rows: DerivedCacheMetadata[]) => void
  ) =>
    read(tx, tx.objectStore(STORES.metadata).getAll(
      undefined, DERIVED_CACHE_DEFAULTS.maxEntries + 1
    ),
      (rows: DerivedCacheMetadata[]) => {
        if (rows.length > DERIVED_CACHE_DEFAULTS.maxEntries) {
          tx.abort();
          return;
        }
        use(rows);
      });
  const erase = (tx: IDBTransaction, record: DerivedCacheMetadata) => {
    const id = [record.namespace, record.key];
    tx.objectStore(STORES.metadata).delete(id);
    tx.objectStore(STORES.payload).delete(id);
  };
  const removeWhere = (matches: (record: DerivedCacheMetadata) => boolean) =>
    run<number>(0, (tx, state, done) => allMetadata(tx, (rows) => {
      let removed = 0;
      let bytes = 0;
      let count = 0;
      for (const record of rows) {
        if (matches(record)) { erase(tx, record); removed += 1; }
        else { bytes += record.bytes; count += 1; }
      }
      tx.objectStore(STORES.state).put({ ...state,
        bytes, count,
      }, STATE_KEY);
      done(removed);
    }));
  const trim = () =>
    run<number>(0, (tx, state, done) => allMetadata(tx, (rows) => {
      const plan = planDerivedCacheTrim(rows.filter(isOwnRecord), state.age);
      for (const victim of plan.evicted) erase(tx, victim);
      const victims = new Set(plan.evicted);
      const remaining = rows.filter(record => !victims.has(record));
      tx.objectStore(STORES.state).put({ ...state,
        age: plan.age,
        bytes: remaining.reduce((sum, record) => sum + record.bytes, 0),
        count: remaining.length,
      }, STATE_KEY);
      done(plan.evicted.length);
    }));
  const cleanupObsoleteEpochs = async () => {
    if (!enabled || closed || !locks) return 0;
    const foreign = await run<readonly (string | null)[] | null>(null, (tx, _state, done) =>
      allMetadata(tx, rows => done([...new Set(rows.map(record =>
        parseEpochNamespace(record.namespace)?.[0] ?? null
      ))].filter(producer => producer !== epoch)))
    );
    let removed = 0;
    for (const producer of foreign ?? []) {
      if (closed) break;
      try {
        await locks.request(leaseName(producer), { mode: "exclusive", ifAvailable: true }, async lock => {
          if (!lock || closed) return;
          // A new client must wait for its shared lease until this atomic delete
          // commits. Existing live epochs are never selected by this cleanup.
          removed += await removeWhere(record =>
            (parseEpochNamespace(record.namespace)?.[0] ?? null) === producer
          );
        });
      } catch { /* Optional idle cleanup; preserve cache availability. */ }
    }
    return removed;
  };
  const cache = {
    get<T>(namespace: string, key: string, version: string, options?: { touch?: boolean }) {
      const physical = physicalNamespace(namespace);
      if (physical === null) return Promise.resolve(null);
      return run<DerivedBufferCacheValue<T> | null>(null, (tx, state, done) =>
        read(tx, tx.objectStore(STORES.metadata).get([physical, key]), (record: DerivedCacheMetadata | undefined) => {
          if (!record || record.version !== version) return;
          read(tx, tx.objectStore(STORES.payload).get([physical, key]), (value: T | undefined) => {
            if (value === undefined) return;
            const metadata = options?.touch === false ? record : {
              ...refreshDerivedCacheMetadata(record, state.age, Date.now()),
              hits: (record.hits ?? 0) + 1,
            };
            if (options?.touch !== false) tx.objectStore(STORES.metadata).put(metadata);
            done({ value, metadata: publicMetadata(metadata) });
          });
        })
      );
    },
    async put<T>(record: DerivedCacheRecord, value: T) {
      const namespace = physicalNamespace(record.namespace);
      if (namespace === null) return false;
      const physicalRecord = { ...record, namespace };
      let quotaExceeded = false;
      const attempt = () => run<boolean>(false, (tx, state, done) => allMetadata(tx, (rows) => {
        const plan = planDerivedCacheAdmission(rows, physicalRecord, { ...state, nowMs: Date.now() });
        if (!plan.record) return;
        for (const victim of plan.evicted) erase(tx, victim);
        tx.objectStore(STORES.payload).put(value, [namespace, record.key]);
        tx.objectStore(STORES.metadata).put(plan.record);
        tx.objectStore(STORES.state).put({ ...state,
          age: plan.age, bytes: plan.bytes, count: plan.count,
        }, STATE_KEY);
        done(true);
      }), () => { quotaExceeded = true; });
      const accepted = await attempt();
      // An unknown benefit never justifies eviction, including native quota
      // pressure outside our budget. A measured candidate may trim once and
      // retry in a fresh transaction; its aborted first write changed nothing.
      if (accepted || !quotaExceeded ||
        derivedCacheSavedMilliseconds(record) === null || await trim() === 0)
        return accepted;
      return attempt();
    },
    updateCosts(
      namespace: string,
      key: string,
      version: string,
      costs: DerivedCacheCosts
    ) {
      const physical = physicalNamespace(namespace);
      if (physical === null) return Promise.resolve(false);
      return run<boolean>(false, (tx, state, done) =>
        read(tx, tx.objectStore(STORES.metadata).get([physical, key]), (record: DerivedCacheMetadata | undefined) => {
          if (!record || record.version !== version) return;
          const next = {
            ...record,
            recomputeMs: costs.recomputeMs ?? record.recomputeMs,
            restoreMs: costs.restoreMs ?? record.restoreMs,
          };
          if (!isDerivedCacheRecordValid(next)) return;
          if (!isDerivedCacheSavingSufficient(next, state.minimumSavingRatio)) {
            erase(tx, record);
            tx.objectStore(STORES.state).put({ ...state,
              bytes: state.bytes - record.bytes, count: state.count - 1,
            }, STATE_KEY);
          } else {
            tx.objectStore(STORES.metadata).put(
              refreshDerivedCacheMetadata(next, state.age, Date.now())
            );
          }
          done(true);
        })
      );
    },
    async remove(namespace: string, key: string, version?: string) {
      const physical = physicalNamespace(namespace);
      if (physical === null) return false;
      return (await removeWhere((record) => record.namespace === physical &&
        record.key === key && (version === undefined || record.version === version))) > 0;
    },
    invalidateNamespace(namespace: string) {
      const physical = physicalNamespace(namespace);
      return physical === null ? Promise.resolve(0)
        : removeWhere((record) => record.namespace === physical);
    },
    /** Current producer only; registered namespace clients cannot trim siblings. */
    trim,
    /** Idle-only, root-manager operation; live foreign epochs keep their leases. */
    cleanupObsoleteEpochs,
    /** The shared byte/entry budget spans all producers, unlike inspect(). */
    stats() {
      return run<DerivedBufferCacheStats | null>(null, (_tx, state, done) => done(state));
    },
    /** On-demand audit only: bounded metadata, never payload deserialization. */
    inspect(namespace?: string) {
      return run<readonly DerivedCacheMetadata[] | null>(null, (tx, _state, done) =>
        allMetadata(tx, (rows) => done(rows.filter(isOwnRecord).map(publicMetadata)
          .filter(record => namespace === undefined || record.namespace === namespace)))
      );
    },
    close() {
      closed = true;
      database?.close();
      database = null;
      leaseAbort?.abort();
      leaseAbort = null;
      releaseLease?.();
      releaseLease = null;
    },
  };
  return {
    ...cache,
    /** Scoped registration is inspectable and cannot override identity via put
     * options. Namespace/version also remain in every persisted metadata record.
     */
    register(namespace: string, version: string) {
      const valid = [namespace, version].every(
        (value) => typeof value === "string" && value.length > 0
      );
      return Object.freeze({
        namespace,
        version,
        get<T>(key: string, options?: { touch?: boolean }) {
          return valid ? cache.get<T>(namespace, key, version, options) : Promise.resolve(null);
        },
        put<T>(key: string, value: T, entry: DerivedCacheCosts & { bytes: number }) {
          return valid ? cache.put({
            namespace, key, version, bytes: entry.bytes,
            recomputeMs: entry.recomputeMs, restoreMs: entry.restoreMs,
          }, value) : Promise.resolve(false);
        },
        remove(key: string) {
          return valid ? cache.remove(namespace, key, version) : Promise.resolve(false);
        },
        updateCosts(key: string, costs: DerivedCacheCosts) {
          return valid ? cache.updateCosts(namespace, key, version, costs) : Promise.resolve(false);
        },
        async inspect() {
          if (!valid) return null;
          const rows = await cache.inspect(namespace);
          return rows?.filter((record) => record.version === version) ?? null;
        },
      });
    },
  };
};

export type DerivedBufferCache = ReturnType<typeof createDerivedBufferCache>;
export type DerivedBufferCacheRegistration = ReturnType<DerivedBufferCache["register"]>;
