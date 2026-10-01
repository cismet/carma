import { createDerivedCacheReader } from "./derived-cache-reader";
import {
  createDerivedCacheLease,
  parseDerivedCacheEpochNamespace,
} from "./derived-cache-lease";
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
import {
  canDeleteDerivedCacheRecord,
  planDerivedCacheTreeProtection,
  type DerivedCacheReadOptions,
  type DerivedCacheTreeProtectionOptions,
} from "./derived-cache-tree-policy";
import {
  createDerivedCacheQuotaSampler,
  DERIVED_CACHE_CAPACITY_MODE,
  DERIVED_CACHE_CAPACITY_SOURCE,
  resolveDerivedCacheQuotaCapacity,
  type DerivedCacheCapacityMode,
  type DerivedCacheCapacitySource,
  type DerivedCacheQuotaSample,
} from "./derived-cache-quota";
const STORES = {
  metadata: "metadata",
  payload: "payload",
  state: "state",
} as const;
const STATE_KEY = "budget";
const READ_WRITE = "readwrite";
const isQuotaError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "QuotaExceededError";
type Policy = NonNullable<ReturnType<typeof resolveDerivedCachePolicy>>;
type BudgetState = Policy & {
  age: number;
  bytes: number;
  count: number;
  configuredCapacityBytes?: number;
  capacityMode?: DerivedCacheCapacityMode;
  capacitySource?: DerivedCacheCapacitySource;
  quotaSample?: DerivedCacheQuotaSample;
  quotaInvalidatedAt?: number;
  quotaBytes?: number | null;
  usageBytes?: number | null;
  otherUsageBytes?: number | null;
  headroomBytes?: number | null;
};
export type DerivedBufferCacheOptions = DerivedCachePolicyOptions &
  Readonly<{
    databaseName?: string;
    producerEpoch?: string;
    enabled?: boolean;
    /** One shared origin budget, sampled in the background; capacityBytes is fallback. */
    adaptiveCapacity?: boolean;
  }>;
export type DerivedBufferCacheStats = Readonly<BudgetState>;
export type DerivedBufferCacheValue<T> = Readonly<{
  value: T;
  metadata: DerivedCacheMetadata;
}>;
/** DBC-01: ./DERIVED_CACHE_DECISIONS.md. Invoke from a worker for large buffers.
 * Native structured cloning only; bytes describe caller-accounted payload, not
 * exact IndexedDB overhead. Disk capacity is unrelated to GPU/RAM budgets.
 * The first mutation persists the shared policy; mismatched clients fail closed.
 * Adaptive clients share a quota sample/capacity, while preserving configured
 * fallback and entry limits. Sampling never delays foreground reads.
 * Producer epochs isolate records, not budgets. Only idle callers should request
 * obsolete-epoch cleanup; live cooperative clients retain shared Web Lock leases.
 * Without Web Locks persistence remains isolated but automatic cleanup is off.
 */
export const createDerivedBufferCache = (
  options: DerivedBufferCacheOptions
) => {
  const policy = resolveDerivedCachePolicy(options);
  const quotaSampler = options.adaptiveCapacity
    ? createDerivedCacheQuotaSampler()
    : null;
  const epoch = options.producerEpoch ?? null;
  const enabled =
    options.enabled !== false &&
    (options.producerEpoch === undefined ||
      (typeof options.producerEpoch === "string" &&
        options.producerEpoch.length > 0));
  const databaseName =
    options.databaseName ?? DERIVED_CACHE_DEFAULTS.databaseName;
  const physicalNamespace = (namespace: string) => {
    if (typeof namespace !== "string" || namespace.length === 0) return null;
    return epoch !== null
      ? JSON.stringify([epoch, namespace])
      : parseDerivedCacheEpochNamespace(namespace)
      ? null
      : namespace;
  };
  const logicalNamespace = (namespace: string) => {
    const pair = parseDerivedCacheEpochNamespace(namespace);
    return pair
      ? pair[0] === epoch
        ? pair[1]
        : null
      : epoch === null
      ? namespace
      : null;
  };
  const isOwnRecord = (record: DerivedCacheMetadata) =>
    logicalNamespace(record.namespace) !== null;
  const publicMetadata = (
    record: DerivedCacheMetadata
  ): DerivedCacheMetadata => ({
    ...record,
    namespace: logicalNamespace(record.namespace)!,
  });
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase | null> | null = null;
  let closed = false;
  const lease = createDerivedCacheLease(databaseName, epoch, enabled);
  const { locks, leaseName } = lease;
  const quotaFailures = new WeakSet<IDBTransaction>();
  const open = async (): Promise<IDBDatabase | null> => {
    if (closed || !enabled || !policy || typeof indexedDB === "undefined")
      return null;
    if (!(await lease.acquire()) || closed) return null;
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
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORES.metadata))
            db.createObjectStore(STORES.metadata, {
              keyPath: ["namespace", "key"],
            });
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
    onQuota?: () => void,
    persistBudget = true,
    readOnly = false
  ): Promise<T> => {
    const db = await open();
    if (!db || !policy || closed) return fallback;
    return new Promise<T>((resolve) => {
      let result = fallback;
      try {
        const tx = db.transaction(
          Object.values(STORES),
          readOnly ? "readonly" : READ_WRITE
        );
        tx.oncomplete = () => resolve(result);
        tx.onerror = (event) => {
          if (isQuotaError((event.target as IDBRequest | null)?.error))
            quotaFailures.add(tx);
        };
        tx.onabort = () => {
          if (isQuotaError(tx.error) || quotaFailures.has(tx)) {
            quotaSampler?.invalidate();
            onQuota?.();
          }
          resolve(fallback);
        };
        read(tx, tx.objectStore(STORES.state).get(STATE_KEY), (stored) => {
          let state: BudgetState = stored ?? {
            ...policy,
            age: 0,
            bytes: 0,
            count: 0,
          };
          if (
            (state.configuredCapacityBytes ?? state.capacityBytes) !==
              policy.capacityBytes ||
            (state.capacityMode !== undefined && !quotaSampler) ||
            state.maxEntries !== policy.maxEntries ||
            state.lowWaterRatio !== policy.lowWaterRatio ||
            state.minimumSavingRatio !== policy.minimumSavingRatio
          )
            return;
          if (quotaSampler) {
            const sample = quotaSampler.read(
              state.bytes,
              state.quotaSample,
              state.quotaInvalidatedAt
            );
            state = {
              ...state,
              ...resolveDerivedCacheQuotaCapacity(policy.capacityBytes, sample),
              configuredCapacityBytes: policy.capacityBytes,
              capacityMode: DERIVED_CACHE_CAPACITY_MODE.ORIGIN_QUOTA,
              quotaSample: sample,
              quotaInvalidatedAt: quotaSampler.invalidatedAt,
            };
          }
          if (
            persistBudget &&
            (!stored ||
              state.capacityBytes !== stored.capacityBytes ||
              state.capacityMode !== stored.capacityMode ||
              state.capacitySource !== stored.capacitySource ||
              state.quotaSample?.sampledAt !== stored.quotaSample?.sampledAt ||
              state.quotaInvalidatedAt !== stored.quotaInvalidatedAt)
          )
            tx.objectStore(STORES.state).put(state, STATE_KEY);
          action(tx, state, (value) => {
            result = value;
          });
        });
      } catch (error) {
        if (isQuotaError(error)) {
          quotaSampler?.invalidate();
          onQuota?.();
        }
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
    use: (rows: DerivedCacheMetadata[]) => void,
    namespace?: string
  ) =>
    read(
      tx,
      tx
        .objectStore(STORES.metadata)
        .getAll(
          namespace !== undefined && typeof IDBKeyRange !== "undefined"
            ? IDBKeyRange.bound([namespace], [namespace, []])
            : undefined,
          DERIVED_CACHE_DEFAULTS.maxEntries + 1
        ),
      (rows: DerivedCacheMetadata[]) => {
        if (rows.length > DERIVED_CACHE_DEFAULTS.maxEntries) {
          tx.abort();
          return;
        }
        use(rows);
      }
    );
  const erase = (tx: IDBTransaction, record: DerivedCacheMetadata) => {
    const id = [record.namespace, record.key];
    tx.objectStore(STORES.metadata).delete(id);
    tx.objectStore(STORES.payload).delete(id);
  };
  const removeWhere = (matches: (record: DerivedCacheMetadata) => boolean) =>
    run<number>(0, (tx, state, done) =>
      allMetadata(tx, (rows) => {
        let removed = 0;
        let bytes = 0;
        let count = 0;
        for (const record of rows) {
          if (matches(record)) {
            erase(tx, record);
            removed += 1;
          } else {
            bytes += record.bytes;
            count += 1;
          }
        }
        tx.objectStore(STORES.state).put({ ...state, bytes, count }, STATE_KEY);
        done(removed);
      })
    );
  const trim = () =>
    run<number>(0, (tx, state, done) =>
      allMetadata(tx, (rows) => {
        const plan = planDerivedCacheTrim(rows.filter(isOwnRecord), state.age);
        for (const victim of plan.evicted) erase(tx, victim);
        const victims = new Set(plan.evicted);
        const remaining = rows.filter((record) => !victims.has(record));
        tx.objectStore(STORES.state).put(
          {
            ...state,
            age: plan.age,
            bytes: remaining.reduce((sum, record) => sum + record.bytes, 0),
            count: remaining.length,
          },
          STATE_KEY
        );
        done(plan.evicted.length);
      })
    );
  const cleanupObsoleteEpochs = async () => {
    if (!enabled || closed || !locks) return 0;
    const foreign = await run<readonly (string | null)[] | null>(
      null,
      (tx, _state, done) =>
        allMetadata(tx, (rows) =>
          done(
            [
              ...new Set(
                rows.map(
                  (record) =>
                    parseDerivedCacheEpochNamespace(record.namespace)?.[0] ??
                    null
                )
              ),
            ].filter((producer) => producer !== epoch)
          )
        )
    );
    let removed = 0;
    for (const producer of foreign ?? []) {
      if (closed) break;
      try {
        await locks.request(
          leaseName(producer),
          { mode: "exclusive", ifAvailable: true },
          async (lock) => {
            if (!lock || closed) return;
            // A new client must wait for its shared lease until this atomic delete
            // commits. Existing live epochs are never selected by this cleanup.
            removed += await removeWhere(
              (record) =>
                (parseDerivedCacheEpochNamespace(record.namespace)?.[0] ??
                  null) === producer
            );
          }
        );
      } catch {
        /* Optional idle cleanup; preserve cache availability. */
      }
    }
    return removed;
  };
  const reader = createDerivedCacheReader({
    transaction: (fallback, use, readOnly) =>
      run(
        fallback,
        (tx, state, done) => use(tx, state.age, done),
        undefined,
        false,
        readOnly
      ),
    read,
    allMetadata,
    physicalNamespace,
    publicMetadata,
  });
  const cache = {
    ...reader,
    async put<T>(record: DerivedCacheRecord, value: T) {
      const namespace = physicalNamespace(record.namespace);
      if (namespace === null) return false;
      const physicalRecord = { ...record, namespace };
      let quotaExceeded = false;
      const attempt = () =>
        run<boolean>(
          false,
          (tx, state, done) => {
            // A missing estimate restricts new writes, but is not evidence that
            // existing useful data should be evicted down to the fallback budget.
            if (
              quotaSampler &&
              state.capacitySource ===
                DERIVED_CACHE_CAPACITY_SOURCE.CONFIGURED_FALLBACK &&
              state.bytes > state.capacityBytes
            )
              return;
            allMetadata(tx, (rows) => {
              const plan = planDerivedCacheAdmission(rows, physicalRecord, {
                ...state,
                nowMs: Date.now(),
              });
              if (!plan.record) return;
              for (const victim of plan.evicted) erase(tx, victim);
              tx.objectStore(STORES.payload).put(value, [
                namespace,
                record.key,
              ]);
              tx.objectStore(STORES.metadata).put(plan.record);
              tx.objectStore(STORES.state).put(
                {
                  ...state,
                  age: plan.age,
                  bytes: plan.bytes,
                  count: plan.count,
                },
                STATE_KEY
              );
              done(true);
            });
          },
          () => {
            quotaExceeded = true;
          }
        );
      const accepted = await attempt();
      // An unknown benefit never justifies eviction, including native quota
      // pressure outside our budget. A measured candidate may trim once and
      // retry in a fresh transaction; its aborted first write changed nothing.
      if (
        accepted ||
        !quotaExceeded ||
        derivedCacheSavedMilliseconds(record) === null ||
        (await trim()) === 0
      )
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
        read(
          tx,
          tx.objectStore(STORES.metadata).get([physical, key]),
          (record: DerivedCacheMetadata | undefined) => {
            if (!record || record.version !== version) return;
            const next = {
              ...record,
              recomputeMs: costs.recomputeMs ?? record.recomputeMs,
              restoreMs: costs.restoreMs ?? record.restoreMs,
            };
            if (!isDerivedCacheRecordValid(next)) return;
            if (
              !isDerivedCacheSavingSufficient(next, state.minimumSavingRatio)
            ) {
              allMetadata(tx, (rows) => {
                if (!canDeleteDerivedCacheRecord(rows, record)) return;
                erase(tx, record);
                tx.objectStore(STORES.state).put(
                  {
                    ...state,
                    bytes: state.bytes - record.bytes,
                    count: state.count - 1,
                  },
                  STATE_KEY
                );
                done(true);
              });
            } else {
              tx.objectStore(STORES.metadata).put({
                ...refreshDerivedCacheMetadata(next, state.age, Date.now()),
                lastAccess: record.lastAccess,
              });
              done(true);
            }
          }
        )
      );
    },
    async remove(namespace: string, key: string, version?: string) {
      const physical = physicalNamespace(namespace);
      if (physical === null) return false;
      return run(false, (tx, state, done) =>
        allMetadata(tx, (rows) => {
          const record = rows.find(
            (record) =>
              record.namespace === physical &&
              record.key === key &&
              (version === undefined || record.version === version)
          );
          if (!record || !canDeleteDerivedCacheRecord(rows, record)) return;
          erase(tx, record);
          tx.objectStore(STORES.state).put(
            {
              ...state,
              bytes: state.bytes - record.bytes,
              count: state.count - 1,
            },
            STATE_KEY
          );
          done(true);
        })
      );
    },
    protectTree(
      namespace: string,
      version: string,
      identity: string,
      nodes: readonly string[],
      options?: DerivedCacheTreeProtectionOptions
    ) {
      const physical = physicalNamespace(namespace);
      if (physical === null) return Promise.resolve(false);
      return run(false, (tx, state, done) =>
        allMetadata(tx, (rows) => {
          const plan = planDerivedCacheTreeProtection(
            rows,
            physical,
            version,
            identity,
            nodes,
            options?.replace === true
          );
          if (!plan) return;
          const removed = new Set<DerivedCacheMetadata>();
          if (options?.manifest) {
            const byKey = new Map(plan.map((record) => [record.key, record]));
            const protectedRows = rows.map((record) =>
              record.namespace === physical && record.version === version
                ? byKey.get(record.key) ?? record
                : record
            );
            const manifest = options.manifest;
            const admission = planDerivedCacheAdmission(
              protectedRows,
              {
                namespace: physical,
                version,
                key: manifest.key,
                bytes: manifest.bytes,
                tree: {
                  identity,
                  node: JSON.stringify(["manifest", manifest.key]),
                  parent: null,
                  level: 0,
                  protected: true,
                },
              },
              { ...state, nowMs: Date.now() }
            );
            if (!admission.record) return;
            for (const victim of admission.evicted) {
              erase(tx, victim);
              removed.add(victim);
            }
            tx.objectStore(STORES.metadata).put(admission.record);
            tx.objectStore(STORES.payload).put(manifest.value, [
              physical,
              manifest.key,
            ]);
            tx.objectStore(STORES.state).put(
              {
                ...state,
                age: admission.age,
                bytes: admission.bytes,
                count: admission.count,
              },
              STATE_KEY
            );
          }
          for (const record of plan)
            if (!removed.has(record) && record.key !== options?.manifest?.key)
              tx.objectStore(STORES.metadata).put(record);
          done(true);
        })
      );
    },
    invalidateNamespace(namespace: string) {
      const physical = physicalNamespace(namespace);
      return physical === null
        ? Promise.resolve(0)
        : removeWhere((record) => record.namespace === physical);
    },
    invalidateTree(namespace: string, version: string, identity: string) {
      const physical = physicalNamespace(namespace);
      return physical === null || !identity
        ? Promise.resolve(0)
        : removeWhere(
            (record) =>
              record.namespace === physical &&
              record.version === version &&
              record.tree?.identity === identity
          );
    },
    /** Current producer only; registered namespace clients cannot trim siblings. */
    trim,
    /** Idle-only, root-manager operation; live foreign epochs keep their leases. */
    cleanupObsoleteEpochs,
    /** The shared byte/entry budget spans all producers, unlike inspect(). */
    stats() {
      return run<DerivedBufferCacheStats | null>(
        null,
        (_tx, state, done) => done(state),
        undefined,
        false
      );
    },
    /** On-demand audit only: bounded metadata, never payload deserialization. */
    inspect(namespace?: string) {
      return run<readonly DerivedCacheMetadata[] | null>(
        null,
        (tx, _state, done) =>
          allMetadata(tx, (rows) =>
            done(
              rows
                .filter(isOwnRecord)
                .map(publicMetadata)
                .filter(
                  (record) =>
                    namespace === undefined || record.namespace === namespace
                )
            )
          ),
        undefined,
        false
      );
    },
    close() {
      closed = true;
      quotaSampler?.close();
      database?.close();
      database = null;
      lease.close();
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
        get<T>(key: string, options?: DerivedCacheReadOptions) {
          return valid
            ? cache.get<T>(namespace, key, version, options)
            : Promise.resolve(null);
        },
        put<T>(
          key: string,
          value: T,
          entry: DerivedCacheCosts & {
            bytes: number;
            tree?: DerivedCacheRecord["tree"];
          }
        ) {
          return valid
            ? cache.put(
                {
                  namespace,
                  key,
                  version,
                  bytes: entry.bytes,
                  recomputeMs: entry.recomputeMs,
                  restoreMs: entry.restoreMs,
                  tree: entry.tree,
                },
                value
              )
            : Promise.resolve(false);
        },
        remove(key: string) {
          return valid
            ? cache.remove(namespace, key, version)
            : Promise.resolve(false);
        },
        protectTree(
          identity: string,
          nodes: readonly string[],
          options?: DerivedCacheTreeProtectionOptions
        ) {
          return valid
            ? cache.protectTree(namespace, version, identity, nodes, options)
            : Promise.resolve(false);
        },
        markTreeUsed(identity: string, nodes: readonly string[]) {
          return valid
            ? cache.markTreeUsed(namespace, version, identity, nodes)
            : Promise.resolve(0);
        },
        invalidateTree(identity: string) {
          return valid
            ? cache.invalidateTree(namespace, version, identity)
            : Promise.resolve(0);
        },
        updateCosts(key: string, costs: DerivedCacheCosts) {
          return valid
            ? cache.updateCosts(namespace, key, version, costs)
            : Promise.resolve(false);
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
export type DerivedBufferCacheRegistration = ReturnType<
  DerivedBufferCache["register"]
>;
