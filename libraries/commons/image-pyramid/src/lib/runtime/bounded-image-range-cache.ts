const CACHE_NAME = "carma-image-ranges-v1";
const KEY_ROOT = "https://cache.carma.invalid/image-ranges/";
const MAX_RANGE_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_WRITE_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_WRITES = 64;
const STORAGE_DEADLINE_MS = 100;
const INVENTORY_INTERVAL_MS = 60_000;
const MAX_INDEXED_RANGES = 4096;
const INVENTORY_BATCH = 128;
const yieldInventory = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

export type KnownImageRangeSnapshot = Readonly<{
  ranges: ReadonlyArray<Readonly<{ offset: number; length: number }>>;
  checkedAt: number;
  validUntil: number;
}>;

type RangeEntry = {
  key: string;
  source: string;
  version: string;
  offset: number;
  length: number;
  savedAt: number;
};

type RangeDiskCache = {
  keys(source?: string): Promise<readonly Request[]>;
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
};

// CacheStorage needs a secure context. IndexedDB keeps the same Blob/key store
// available on the LAN HTTP development URLs without adding a cache framework.
const openIndexedDb = (
  factory: IDBFactory
): Promise<RangeDiskCache | undefined> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (cache?: RangeDiskCache) => {
      if (settled) return;
      settled = true;
      resolve(cache);
    };
    try {
      const opening = factory.open(CACHE_NAME, 1);
      opening.onupgradeneeded = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains("ranges"))
          database.createObjectStore("ranges");
      };
      opening.onerror = opening.onblocked = () => finish();
      opening.onsuccess = () => {
        const database = opening.result;
        if (settled) {
          database.close();
          return;
        }
        database.onversionchange = () => database.close();
        const transaction = <T>(
          mode: IDBTransactionMode,
          action: (store: IDBObjectStore) => IDBRequest<T>
        ) =>
          new Promise<T>((resolve, reject) => {
            try {
              const tx = database.transaction("ranges", mode);
              const request = action(tx.objectStore("ranges"));
              tx.oncomplete = () => resolve(request.result);
              tx.onerror = tx.onabort = () =>
                reject(
                  tx.error ??
                    request.error ??
                    Error("Image cache transaction failed")
                );
            } catch (error) {
              reject(error);
            }
          });
        finish({
          keys: async (source) => {
            const prefix = source ? source + "?" : undefined;
            const range =
              prefix && typeof IDBKeyRange !== "undefined"
                ? IDBKeyRange.bound(prefix, prefix + "\uffff")
                : undefined;
            const keys = await transaction("readonly", (store) =>
              store.getAllKeys(range)
            );
            return keys
              .filter(
                (key): key is string =>
                  typeof key === "string" && (!prefix || key.startsWith(prefix))
              )
              .map((key) => new Request(key));
          },
          match: async (key) => {
            const body = await transaction("readonly", (store) =>
              store.get(key)
            );
            return body instanceof Blob
              ? new Response(body, { status: 200 })
              : undefined;
          },
          put: async (key, response) => {
            const body = await response.blob();
            await transaction("readwrite", (store) => store.put(body, key));
          },
          delete: async (key) => {
            await transaction("readwrite", (store) => store.delete(key));
            return true;
          },
        });
      };
    } catch {
      finish();
    }
  });

const readEntry = (request: Request): RangeEntry | undefined => {
  if (!request.url.startsWith(KEY_ROOT)) return;
  const key = new URL(request.url);
  const offset = Number(key.searchParams.get("offset"));
  const length = Number(key.searchParams.get("length"));
  const savedAt = Number(key.searchParams.get("saved"));
  const version = key.searchParams.get("version");
  if (
    !version ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length > MAX_RANGE_BYTES ||
    !Number.isSafeInteger(offset + length) ||
    !Number.isFinite(savedAt)
  )
    return;
  return {
    key: request.url,
    source: key.origin + key.pathname,
    version,
    offset,
    length,
    savedAt,
  };
};

// CacheStorage operations cannot be cancelled. Bound the caller's wait and let
// late storage work finish without holding up a foreground image request.
const storageDeadline = async <T>(
  operation: Promise<T>,
  signal?: AbortSignal
): Promise<T | undefined> => {
  signal?.throwIfAborted();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation.catch(() => undefined),
      new Promise<undefined>((resolve, reject) => {
        timeout = setTimeout(() => resolve(undefined), STORAGE_DEADLINE_MS);
        if (signal) {
          abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        }
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (abort) signal?.removeEventListener("abort", abort);
  }
};

class RangeStore {
  private cache: Promise<RangeDiskCache | undefined>;
  private readonly inventories = new Map<string, Promise<void>>();
  private entries = new Map<string, RangeEntry>();
  private sources = new Map<string, Map<string, RangeEntry>>();
  private indexTruncated = false;
  private readonly verifiedVersions = new Map<string, string>();
  private lastSavedAt = 0;
  private readonly inventoryAt = new Map<string, number>();
  private pendingWrites = 0;
  private pendingWriteBytes = 0;
  private writes: Promise<void> = Promise.resolve();

  constructor(open: () => Promise<RangeDiskCache | undefined>) {
    this.cache = Promise.resolve()
      .then(open)
      .catch(() => undefined);
  }

  private async readInventory(cache: RangeDiskCache, source: string) {
    // CacheStorage performs the URL match itself; unrelated photos are never
    // enumerated on the foreground path. IDB uses the equivalent source prefix.
    const keys = await cache.keys(source);
    this.inventoryAt.delete(source);
    this.verifiedVersions.delete(source);
    for (const entry of [...this.entries.values()])
      if (entry.source === source) this.remove(entry.key);
    for (let i = 0; i < keys.length; i++) {
      const entry = readEntry(keys[i]);
      if (entry?.source === source) this.add(entry);
      if ((i + 1) % INVENTORY_BATCH === 0) await yieldInventory();
    }
    this.inventoryAt.set(source, Date.now());
    while (this.inventoryAt.size > MAX_INDEXED_RANGES)
      this.inventoryAt.delete(this.inventoryAt.keys().next().value!);
  }

  private add(entry: RangeEntry) {
    this.remove(entry.key);
    this.entries.set(entry.key, entry);
    const identity = entry.source + "?" + entry.version;
    const source = this.sources.get(identity) ?? new Map<string, RangeEntry>();
    source.set(entry.key, entry);
    this.sources.set(identity, source);
    this.lastSavedAt = Math.max(this.lastSavedAt, entry.savedAt);
    while (this.entries.size > MAX_INDEXED_RANGES) {
      // Metadata is merely an acceleration index. Dropping it must never delete
      // the corresponding persistent bytes; get() reopens that source on demand.
      this.indexTruncated = true;
      this.remove(this.entries.keys().next().value!);
    }
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    const identity = entry.source + "?" + entry.version;
    const source = this.sources.get(identity);
    source?.delete(key);
    if (!source?.size) this.sources.delete(identity);
  }

  private async ready(source: string) {
    const cache = await this.cache;
    if (!cache) return;
    const checkedAt = this.inventoryAt.get(source);
    if (
      checkedAt === undefined ||
      Date.now() >= checkedAt + INVENTORY_INTERVAL_MS
    )
      await this.refreshInventory(cache, source);
    return cache;
  }

  private refreshInventory(
    cache: RangeDiskCache,
    source: string
  ): Promise<void> {
    const pending = this.inventories.get(source);
    if (pending) return pending;
    const inventory = this.readInventory(cache, source).finally(() => {
      this.inventories.delete(source);
    });
    this.inventories.set(source, inventory);
    return inventory;
  }

  async ensureKnownRanges(source: string): Promise<void> {
    await this.ready(source);
  }

  private async hydrateRange(
    cache: RangeDiskCache,
    source: string,
    version: string,
    offset: number,
    length: number,
    signal?: AbortSignal
  ) {
    const keys = await cache.keys(source);
    signal?.throwIfAborted();
    const end = offset + length;
    for (let i = 0; i < keys.length; i++) {
      const entry = readEntry(keys[i]);
      if (
        entry?.source === source &&
        entry.version === version &&
        entry.offset < end &&
        entry.offset + entry.length > offset
      ) {
        this.add(entry);
        // A containing blob answers this request immediately. Do not inspect
        // thousands of unrelated ranges from the same photo after finding it.
        if (entry.offset <= offset && entry.offset + entry.length >= end)
          return;
      }
      if ((i + 1) % INVENTORY_BATCH === 0) {
        await yieldInventory();
        signal?.throwIfAborted();
      }
    }
  }

  /** Metadata only: another worker or browser eviction is rechecked by the normal get path. */
  knownRanges(
    source: string,
    version: string
  ): KnownImageRangeSnapshot | undefined {
    const checkedAt = this.inventoryAt.get(source);
    if (
      checkedAt === undefined ||
      Date.now() >= checkedAt + INVENTORY_INTERVAL_MS
    )
      return;
    return {
      ranges: [
        ...(this.sources.get(source + "?" + version)?.values() ?? []),
      ].map(({ offset, length }) => ({ offset, length })),
      checkedAt,
      validUntil: checkedAt + INVENTORY_INTERVAL_MS,
    };
  }

  async get(
    source: string,
    offset: number,
    length: number,
    version: string,
    signal: AbortSignal,
    refreshed = false
  ): Promise<Uint8Array | undefined> {
    const cache = await this.ready(source);
    signal.throwIfAborted();
    if (!cache) return;
    const end = offset + length;
    const entries = [
      ...(this.sources.get(source + "?" + version)?.values() ?? []),
    ];
    const containing = entries
      .filter(
        (candidate) =>
          candidate.offset <= offset &&
          candidate.offset + candidate.length >= end
      )
      .sort((a, b) => a.length - b.length)[0];
    const pieces: { entry: RangeEntry; left: number; right: number }[] = [];
    if (containing)
      pieces.push({ entry: containing, left: offset, right: end });
    else {
      const candidates = entries
        .filter(
          (entry) => entry.offset < end && entry.offset + entry.length > offset
        )
        .sort((a, b) => a.offset - b.offset || b.length - a.length);
      let at = offset,
        cursor = 0;
      while (at < end) {
        let best: RangeEntry | undefined;
        while (cursor < candidates.length && candidates[cursor].offset <= at) {
          const candidate = candidates[cursor++];
          if (
            candidate.offset + candidate.length > at &&
            (!best ||
              candidate.offset + candidate.length > best.offset + best.length)
          )
            best = candidate;
        }
        if (!best) {
          if (refreshed || !this.indexTruncated) return;
          // Recover evicted metadata without loading or copying cached bodies.
          await this.hydrateRange(
            cache,
            source,
            version,
            offset,
            length,
            signal
          );
          return this.get(source, offset, length, version, signal, true);
        }
        const right = Math.min(end, best.offset + best.length);
        pieces.push({ entry: best, left: at, right });
        at = right;
      }
    }
    const output = pieces.length > 1 ? new Uint8Array(length) : undefined;
    for (const { entry, left, right } of pieces) {
      signal.throwIfAborted();
      const response = await cache.match(entry.key);
      signal.throwIfAborted();
      if (!response || response.status !== 200) {
        this.remove(entry.key);
        return;
      }
      const body = await response.blob();
      signal.throwIfAborted();
      if (body.size !== entry.length) {
        this.remove(entry.key);
        void cache.delete(entry.key).catch(() => false);
        return;
      }
      // Read just the requested slices, even when an AVIF item straddles two cached blocks.
      const bytes = new Uint8Array(
        await body
          .slice(left - entry.offset, right - entry.offset)
          .arrayBuffer()
      );
      signal.throwIfAborted();
      if (!output) return bytes;
      output.set(bytes, left - offset);
    }
    return output;
  }

  private async pruneForQuota(cache: RangeDiskCache, incomingBytes: number) {
    // This is the only global inventory. Quota recovery is rare and chunked;
    // ordinary foreground reads always enumerate one source only.
    const keys = await cache.keys();
    const tiers: RangeEntry[][] = [[], [], []];
    const deadline = performance.now() + STORAGE_DEADLINE_MS;
    let bytes = 0;
    let complete = true;
    for (let i = 0; i < keys.length; i++) {
      const entry = readEntry(keys[i]);
      if (entry) {
        bytes += entry.length;
        const tier = entry.source.includes("thumbnail-png-")
          ? 2
          : entry.offset === 0
          ? 1
          : 0;
        if (
          tiers[tier].length <
          (tier === 0 ? MAX_INDEXED_RANGES : INVENTORY_BATCH)
        )
          tiers[tier].push(entry);
      }
      if ((i + 1) % INVENTORY_BATCH === 0) {
        await yieldInventory();
        if (performance.now() >= deadline && i + 1 < keys.length) {
          complete = false;
          break;
        }
      }
    }
    // Keep prefixes and thumbnail derivatives unless the complete inventory
    // confirms that the available detail ranges cannot release enough space.
    const releaseBytes = Math.max(incomingBytes, bytes * 0.1);
    let freed = 0;
    for (const entries of complete ? tiers : tiers.slice(0, 1)) {
      entries.sort((a, b) => b.length - a.length || a.savedAt - b.savedAt);
      for (const entry of entries) {
        if (freed >= releaseBytes) return;
        await cache.delete(entry.key);
        this.remove(entry.key);
        freed += entry.length;
      }
    }
  }

  private async removeOldVersions(
    cache: RangeDiskCache,
    source: string,
    version: string
  ) {
    if (this.verifiedVersions.get(source) === version) return;
    if (this.indexTruncated) {
      const keys = await cache.keys(source);
      for (let i = 0; i < keys.length; i++) {
        const entry = readEntry(keys[i]);
        if (entry?.source === source && entry.version !== version) {
          await cache.delete(entry.key);
          this.remove(entry.key);
        }
        if ((i + 1) % INVENTORY_BATCH === 0) await yieldInventory();
      }
    } else {
      for (const entry of [...this.entries.values()]) {
        if (entry.source !== source || entry.version === version) continue;
        await cache.delete(entry.key);
        this.remove(entry.key);
      }
    }
    this.verifiedVersions.delete(source);
    this.verifiedVersions.set(source, version);
    while (this.verifiedVersions.size > MAX_INDEXED_RANGES)
      this.verifiedVersions.delete(this.verifiedVersions.keys().next().value!);
  }

  async put(
    source: string,
    offset: number,
    bytes: Uint8Array,
    version: string
  ) {
    // Include the active write: caller deadlines cannot cancel storage or free
    // its retained bytes. Multipart bursts queue without an unbounded backlog.
    const length = bytes.byteLength;
    if (
      this.pendingWrites >= MAX_PENDING_WRITES ||
      this.pendingWriteBytes + length > MAX_PENDING_WRITE_BYTES
    )
      return;
    const response = new Response(bytes.slice(), {
      status: 200,
      headers: { "Content-Length": String(length) },
    });
    this.pendingWrites++;
    this.pendingWriteBytes += length;
    const write = this.writes.then(async () => {
      const cache = await this.ready(source);
      if (!cache) return;
      const contained = () =>
        [...(this.sources.get(source + "?" + version)?.values() ?? [])].some(
          (entry) =>
            entry.offset <= offset &&
            entry.offset + entry.length >= offset + length
        );
      if (!contained() && this.indexTruncated)
        await this.hydrateRange(cache, source, version, offset, length);
      // Metadata eviction must not create a duplicate persistent Blob.
      if (contained()) return;
      const savedAt = Math.max(Date.now(), this.lastSavedAt + 1);
      const key = new URL(source);
      key.searchParams.set("version", version);
      key.searchParams.set("offset", String(offset));
      key.searchParams.set("length", String(length));
      key.searchParams.set("saved", String(savedAt));
      try {
        await cache.put(key.href, response);
      } catch (error) {
        // Disabled storage must not discard useful entries. Only actual quota
        // pressure releases old compressed ranges; image loading stays fail-open.
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          (error.name === "QuotaExceededError" ||
            error.name === "NS_ERROR_DOM_QUOTA_REACHED")
        )
          await this.pruneForQuota(cache, length);
        return;
      }
      this.add({
        key: key.href,
        source,
        version,
        offset,
        length,
        savedAt,
      });
      await this.removeOldVersions(cache, source, version);
    });
    this.writes = write
      .catch(() => undefined)
      .finally(() => {
        this.pendingWrites--;
        this.pendingWriteBytes -= length;
      });
    await this.writes;
  }
}

const stores = new WeakMap<object, RangeStore>();

/** Persistent compressed ranges; these bytes are never retained as decoded RAM.
 * Keys are storage-only and MUST NOT be used as network image URLs.
 */
export class BoundedImageRangeCache {
  private source: string;

  constructor(url: string) {
    this.source = KEY_ROOT + encodeURIComponent(url);
  }

  private store() {
    const cacheStorage = typeof caches === "undefined" ? undefined : caches;
    const idb = typeof indexedDB === "undefined" ? undefined : indexedDB;
    const backend = cacheStorage ?? idb;
    if (!backend) return;
    let store = stores.get(backend);
    if (!store) {
      store = new RangeStore(async () => {
        if (cacheStorage) {
          try {
            const cache = await cacheStorage.open(CACHE_NAME);
            return {
              keys: (source) =>
                source
                  ? cache.keys(source, { ignoreSearch: true })
                  : cache.keys(),
              match: (key) => cache.match(key),
              put: (key, response) => cache.put(key, response),
              delete: (key) => cache.delete(key),
            };
          } catch {
            // An exposed but disabled CacheStorage may still have working IDB.
          }
        }
        return idb ? openIndexedDb(idb) : undefined;
      });
      stores.set(backend, store);
    }
    return store;
  }

  /** Read a fresh known inventory synchronously, without opening storage or reading any bytes. */
  knownRanges(version: string): KnownImageRangeSnapshot | undefined {
    if (!version) return;
    const backend =
      typeof caches !== "undefined"
        ? caches
        : typeof indexedDB !== "undefined"
        ? indexedDB
        : undefined;
    return backend
      ? stores.get(backend)?.knownRanges(this.source, version)
      : undefined;
  }

  /** Refresh expired storage metadata only; byte reads and HTTP remain demand driven. */
  async ensureKnownRanges(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const store = this.store();
    if (store)
      await storageDeadline(store.ensureKnownRanges(this.source), signal);
    signal.throwIfAborted();
  }

  async get(
    offset: number,
    length: number,
    version: string,
    signal: AbortSignal
  ): Promise<Uint8Array | undefined> {
    signal.throwIfAborted();
    if (!version || !validRange(offset, length)) return;
    const store = this.store();
    if (!store) return;
    return storageDeadline(
      store.get(this.source, offset, length, version, signal),
      signal
    );
  }

  async put(offset: number, bytes: Uint8Array, version: string): Promise<void> {
    if (!version || !validRange(offset, bytes.byteLength)) return;
    const store = this.store();
    if (store)
      await storageDeadline(store.put(this.source, offset, bytes, version));
  }
}

const validRange = (offset: number, length: number) =>
  Number.isSafeInteger(offset) &&
  offset >= 0 &&
  Number.isSafeInteger(length) &&
  length > 0 &&
  length <= MAX_RANGE_BYTES &&
  Number.isSafeInteger(offset + length);
