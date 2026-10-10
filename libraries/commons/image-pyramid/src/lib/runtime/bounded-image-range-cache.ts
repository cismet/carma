const CACHE_NAME = "carma-image-ranges-v1";
const KEY_ROOT = "https://cache.carma.invalid/image-ranges/";
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_SOURCES = 8;
const MAX_RANGE_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_WRITE_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_WRITES = 64;
const STORAGE_DEADLINE_MS = 100;
const INVENTORY_INTERVAL_MS = 60_000;

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
  keys(): Promise<readonly Request[]>;
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
          keys: async () => {
            const keys = await transaction("readonly", (store) =>
              store.getAllKeys()
            );
            return keys
              .filter((key): key is string => typeof key === "string")
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
  private inventory?: Promise<void>;
  private entries = new Map<string, RangeEntry>();
  private sources = new Map<string, Map<string, RangeEntry>>();
  private bytes = 0;
  private lastSavedAt = 0;
  private inventoryAt = 0;
  private pendingWrites = 0;
  private pendingWriteBytes = 0;
  private writes: Promise<void> = Promise.resolve();

  constructor(open: () => Promise<RangeDiskCache | undefined>) {
    this.cache = Promise.resolve()
      .then(open)
      .catch(() => undefined);
  }

  private async readInventory(cache: RangeDiskCache) {
    const keys = await cache.keys();
    this.entries.clear();
    this.sources.clear();
    this.bytes = 0;
    for (const key of keys) {
      const entry = readEntry(key);
      if (entry) this.add(entry);
    }
    this.inventoryAt = Date.now();
  }

  private add(entry: RangeEntry) {
    this.remove(entry.key);
    this.entries.set(entry.key, entry);
    const identity = entry.source + "?" + entry.version;
    const source = this.sources.get(identity) ?? new Map<string, RangeEntry>();
    source.set(entry.key, entry);
    this.sources.set(identity, source);
    this.bytes += entry.length;
    this.lastSavedAt = Math.max(this.lastSavedAt, entry.savedAt);
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.bytes -= entry.length;
    const identity = entry.source + "?" + entry.version;
    const source = this.sources.get(identity);
    source?.delete(key);
    if (!source?.size) this.sources.delete(identity);
  }

  private async ready() {
    const cache = await this.cache;
    if (!cache) return;
    // One shared inventory also supplies every source/version's extent index.
    if (!this.inventoryAt) await this.refreshInventory(cache);
    return cache;
  }

  private refreshInventory(cache: RangeDiskCache): Promise<void> {
    this.inventory ??= this.readInventory(cache).finally(() => {
      this.inventory = undefined;
    });
    return this.inventory;
  }

  async ensureKnownRanges(): Promise<void> {
    const cache = await this.ready();
    if (cache && Date.now() >= this.inventoryAt + INVENTORY_INTERVAL_MS)
      await this.refreshInventory(cache);
  }

  /** Metadata only: another worker or browser eviction is rechecked by the normal get path. */
  knownRanges(
    source: string,
    version: string
  ): KnownImageRangeSnapshot | undefined {
    if (
      !this.inventoryAt ||
      Date.now() >= this.inventoryAt + INVENTORY_INTERVAL_MS
    )
      return;
    return {
      ranges: [
        ...(this.sources.get(source + "?" + version)?.values() ?? []),
      ].map(({ offset, length }) => ({ offset, length })),
      checkedAt: this.inventoryAt,
      validUntil: this.inventoryAt + INVENTORY_INTERVAL_MS,
    };
  }

  async get(
    source: string,
    offset: number,
    length: number,
    version: string,
    signal: AbortSignal
  ): Promise<Uint8Array | undefined> {
    const cache = await this.ready();
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
        if (!best) return;
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

  private async prune(cache: RangeDiskCache, limit = MAX_BYTES) {
    if (this.bytes <= limit && this.sources.size <= MAX_SOURCES) return;
    // Leave headroom so a full cache is not sorted/pruned for every next tile.
    const retainedBytes =
      limit === MAX_BYTES && this.bytes > limit ? limit * 0.9 : limit;
    const entries = [...this.entries.values()].sort(
      (a, b) => a.savedAt - b.savedAt
    );
    const newestSource = new Map<string, number>();
    for (const entry of entries)
      newestSource.set(entry.source + "?" + entry.version, entry.savedAt);
    const retained = new Set(
      [...newestSource.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_SOURCES)
        .map(([source]) => source)
    );
    for (const entry of entries) {
      if (
        this.bytes <= retainedBytes &&
        retained.has(entry.source + "?" + entry.version)
      )
        continue;
      await cache.delete(entry.key);
      this.remove(entry.key);
    }
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
      const cache = await this.ready();
      if (!cache) return;
      if (Date.now() - this.inventoryAt >= INVENTORY_INTERVAL_MS)
        await this.refreshInventory(cache);
      if (
        [...(this.sources.get(source + "?" + version)?.values() ?? [])].some(
          (entry) =>
            entry.offset <= offset &&
            entry.offset + entry.length >= offset + length
        )
      )
        return;
      const savedAt = Math.max(Date.now(), this.lastSavedAt + 1);
      const key = new URL(source);
      key.searchParams.set("version", version);
      key.searchParams.set("offset", String(offset));
      key.searchParams.set("length", String(length));
      key.searchParams.set("saved", String(savedAt));
      try {
        await cache.put(key.href, response);
      } catch {
        // Quota or disabled storage leaves network/image loading unaffected.
        await this.prune(cache, Math.max(0, this.bytes - length));
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
      await this.prune(cache);
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
            return await cacheStorage.open(CACHE_NAME);
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
    if (store) await storageDeadline(store.ensureKnownRanges(), signal);
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
