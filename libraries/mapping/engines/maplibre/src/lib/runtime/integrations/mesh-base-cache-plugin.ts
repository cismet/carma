import type { Tile } from "3d-tiles-renderer/core";
import { Matrix4, type Object3D } from "three";
import {
  snapshotMeshBaseRenderRecord,
  restoreMeshBaseRenderRecord,
  type MeshBaseRenderRecord,
} from "../../core/mesh-base-render-record";
import {
  MESH_BASE_CACHE_OPERATION,
  MESH_BASE_RENDER_FORMAT,
  meshBaseCacheSourceUrl,
  type MeshBaseCacheRequest,
  type MeshBaseCacheResponse,
  type MeshBaseManifest,
} from "../../core/mesh-base-cache-protocol";
import { collectCachedMeshBase } from "../../core/mesh-base-cache-coverage";
import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";

type Request = MeshBaseCacheRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;
type NativeRenderer = RuntimeTilesRenderer & {
  parseTile: (
    buffer: ArrayBuffer,
    tile: Tile,
    extension: string,
    url: string,
    signal: AbortSignal
  ) => Promise<void>;
};
const marker = 0x3172626d; // mbr1, a private parseToMesh payload, never persisted.
const closeRecord = (record: MeshBaseRenderRecord) => {
  for (const texture of Object.values(record.textures ?? {}))
    texture?.image?.close?.();
};

/** Optional, bounded I/O. Native traversal, publication, transforms and resource
 * disposal remain with TilesRenderer; cache misses retain its source path. */
export class MeshBaseCachePlugin {
  readonly name = "CARMA_MESH_BASE_CACHE";
  readonly priority = -200;
  private tiles!: NativeRenderer;
  private worker: Worker | null = null;
  private revision = "";
  private sequence = 0;
  private initialized = false;
  private disposed = false;
  private confirming = false;
  private lastAudit = 0;
  private manifest: MeshBaseManifest | null = null;
  private confirmedUrls = new Set<string>();
  private stored = new Set<string>();
  private writing = new Set<string>();
  private pendingBytes = 0;
  private readonly pendingWrites = new Map<string, MeshBaseRenderRecord>();
  private readonly storedBytes = new Map<string, number>();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private prepared = new Map<
    number,
    { record: MeshBaseRenderRecord; cleanup: () => void }
  >();
  private jobs = new Map<
    number,
    (value: MeshBaseCacheResponse["value"]) => void
  >();
  private readonly stats = {
    hits: 0,
    misses: 0,
    writes: 0,
    skipped: 0,
    readMs: 0,
    restoreMs: 0,
    confirmed: false,
  };

  constructor(
    private readonly options: {
      sourceUrl: string;
      buildId: string;
      extentError: () => number;
      memoryBudget: () => number;
      canPrepare: () => boolean;
      onConfirmed: () => void;
      fetchSource: (url: string, options: RequestInit) => Promise<Response>;
    }
  ) {}

  init(tiles: RuntimeTilesRenderer) {
    this.tiles = tiles as NativeRenderer;
    tiles.addEventListener("update-after", this.updateAfter);
  }
  getStats() {
    return {
      ...this.stats,
      pendingBytes: this.pendingBytes,
      manifest: this.manifest,
    };
  }

  private request(
    data: Request,
    deadline = 200
  ): Promise<MeshBaseCacheResponse["value"]> {
    if (!this.worker || this.disposed) return Promise.resolve(null);
    const id = ++this.sequence;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.jobs.delete(id);
        if (data.operation === MESH_BASE_CACHE_OPERATION.get) {
          this.confirmedUrls.clear();
          this.stats.confirmed = false;
        }
        resolve(null);
      }, deadline);
      this.jobs.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      try {
        this.worker!.postMessage({ ...data, id });
      } catch {
        this.jobs.get(id)?.(null);
        this.jobs.delete(id);
      }
    });
  }

  /** The existing hierarchy loader validates the root before calling this. */
  async initialize(document: object) {
    if (this.initialized || this.disposed) return;
    this.initialized = true;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(document));
      this.revision = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0")
      ).join("");
      this.worker = new Worker(
        new URL("./mesh-base-cache.worker.ts", import.meta.url),
        { type: "module" }
      );
      this.worker.onmessage = ({
        data,
      }: MessageEvent<MeshBaseCacheResponse>) => {
        const job = this.jobs.get(data.id);
        this.jobs.delete(data.id);
        if (job) job(data.value);
        else if (
          data.value &&
          typeof data.value === "object" &&
          "urls" in data.value
        )
          this.acceptManifest(data.value);
        else if (
          data.value &&
          typeof data.value === "object" &&
          "textures" in data.value
        )
          closeRecord(data.value);
      };
      this.worker.onerror = () => this.stopWorker();
      const saved = await this.request(
        {
          operation: MESH_BASE_CACHE_OPERATION.initialize,
          sourceUrl: meshBaseCacheSourceUrl(this.options.sourceUrl),
          sourceRevision: this.revision,
          buildId: this.options.buildId,
        },
        200
      );
      if (saved && typeof saved === "object" && "urls" in saved)
        this.acceptManifest(saved);
    } catch {
      this.stopWorker();
    }
  }

  private acceptManifest(saved: MeshBaseManifest) {
    if (this.disposed || saved.residentBytes > this.options.memoryBudget())
      return;
    this.manifest = saved;
    this.confirmedUrls = new Set(saved.urls);
    this.stored = new Set(saved.urls);
    this.stats.confirmed = true;
    this.options.onConfirmed();
  }

  fetchData(url: string, options: RequestInit): Promise<Response> | null {
    if (!this.confirmedUrls.has(url) || !this.worker) return null;
    return (async () => {
      const start = performance.now();
      const result = await this.request({
        operation: MESH_BASE_CACHE_OPERATION.get,
        url,
      });
      this.stats.readMs += performance.now() - start;
      if (options.signal?.aborted || this.disposed) {
        if (result && typeof result === "object" && "textures" in result)
          closeRecord(result);
        options.signal?.throwIfAborted();
        throw new DOMException("Disposed", "AbortError");
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("textures" in result) ||
        result.version !== MESH_BASE_RENDER_FORMAT
      ) {
        if (result && typeof result === "object" && "textures" in result)
          closeRecord(result);
        this.stats.misses++;
        this.confirmedUrls.delete(url);
        this.stored.delete(url);
        this.storedBytes.delete(url);
        this.stats.confirmed = false;
        return this.options.fetchSource(url, options);
      }
      const id = ++this.sequence;
      const cancel = () => {
        const value = this.prepared.get(id);
        if (value) {
          value.cleanup();
          closeRecord(value.record);
        }
        this.prepared.delete(id);
      };
      options.signal?.addEventListener("abort", cancel, { once: true });
      this.prepared.set(id, {
        record: result,
        cleanup: () => options.signal?.removeEventListener("abort", cancel),
      });
      this.stats.hits++;
      const buffer = new ArrayBuffer(8),
        view = new DataView(buffer);
      view.setUint32(0, marker, true);
      view.setUint32(4, id, true);
      return new Response(buffer);
    })();
  }

  parseTile(
    buffer: ArrayBuffer,
    tile: Tile,
    extension: string,
    url: string,
    signal: AbortSignal
  ) {
    if (
      buffer.byteLength !== 8 ||
      new DataView(buffer).getUint32(0, true) !== marker
    )
      return null;
    // Bypass deferred opaque-material parsing: this confirmed record already
    // contains complete original materials. The native parser still runs every
    // processTileModel hook and owns subsequent resources and visibility.
    return this.tiles
      .parseTile(buffer, tile, extension, url, signal)
      .catch(async () => {
        // A corrupt or unsupported record must not turn into a retry loop.
        this.confirmedUrls.delete(url);
        this.stored.delete(url);
        this.stats.confirmed = false;
        signal.throwIfAborted();
        const response = await this.options.fetchSource(url, {
          ...this.tiles.fetchOptions,
          signal,
        });
        if (!response.ok) throw new Error(`Tile response ${response.status}`);
        return this.tiles.parseTile(
          await response.arrayBuffer(),
          tile,
          extension,
          url,
          signal
        );
      });
  }

  parseToMesh(buffer: ArrayBuffer) {
    if (
      buffer.byteLength !== 8 ||
      new DataView(buffer).getUint32(0, true) !== marker
    )
      return null;
    const id = new DataView(buffer).getUint32(4, true),
      prepared = this.prepared.get(id);
    if (!prepared) throw new Error("Missing prepared mesh record");
    this.prepared.delete(id);
    prepared.cleanup();
    const start = performance.now();
    let scene: Object3D & { featureTable?: object; batchTable?: object };
    try {
      scene = restoreMeshBaseRenderRecord(prepared.record);
    } catch (error) {
      closeRecord(prepared.record);
      throw error;
    }
    this.stats.restoreMs += performance.now() - start;
    return {
      scene,
      featureTable: scene.featureTable,
      batchTable: scene.batchTable,
    };
  }

  processTileModel(scene: Object3D, tile: Tile) {
    const runtime = tile as RuntimeTile;
    const url = resolveTileContentUrl(runtime);
    if (
      !url ||
      !this.worker ||
      !this.revision ||
      this.stored.has(url) ||
      this.writing.has(url) ||
      this.pendingWrites.has(url) ||
      tile.geometricError < this.options.extentError()
    )
      return;
    // Snapshot before application styling can replace original materials.
    const record = snapshotMeshBaseRenderRecord(
      scene,
      runtime.engineData?.transform ?? new Matrix4()
    );
    if (
      !record ||
      record.bytes + this.pendingBytes > this.options.memoryBudget()
    ) {
      this.stats.skipped++;
      return;
    }
    // Records reference existing geometry/bitmaps. Clone only one record at a
    // time, after the visible view has converged; cache work never holds a tile.
    this.pendingWrites.set(url, record);
    this.pendingBytes += record.bytes;
    this.scheduleWrite();
  }

  private scheduleWrite() {
    if (
      this.writeTimer ||
      this.disposed ||
      !this.worker ||
      !this.pendingWrites.size ||
      this.writing.size
    )
      return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      if (!this.options.canPrepare()) {
        this.scheduleWrite();
        return;
      }
      const [url, record] = this.pendingWrites.entries().next().value!;
      this.pendingWrites.delete(url);
      this.writing.add(url);
      void this.request(
        { operation: MESH_BASE_CACHE_OPERATION.put, url, record },
        5000
      ).then((saved) => {
        this.writing.delete(url);
        this.pendingBytes -= record.bytes;
        if (saved === true) {
          this.stored.add(url);
          this.storedBytes.set(url, record.bytes);
          this.stats.writes++;
        } else this.stats.skipped++;
        this.scheduleWrite();
        if (!this.pendingWrites.size) {
          this.lastAudit = 0;
          this.updateAfter();
        }
      });
    }, 250);
  }

  private updateAfter = () => {
    if (
      this.disposed ||
      !this.worker ||
      this.confirming ||
      !this.options.canPrepare() ||
      performance.now() - this.lastAudit < 1000
    )
      return;
    this.lastAudit = performance.now();
    const root = this.tiles.root;
    if (!root) return;
    const roots = collectCachedMeshBase(
      root as RuntimeTile,
      (tile) =>
        tile.internal?.hasRenderableContent === true &&
        this.stored.has(resolveTileContentUrl(tile) ?? ""),
      (tile) =>
        !tile.internal ||
        (tile.internal.hasUnrenderableContent &&
          tile.internal.loadingState !== 4)
          ? null
          : ((tile.children ?? []) as RuntimeTile[]),
      (tile) =>
        !tile.internal.hasRenderableContent &&
        !tile.internal.hasUnrenderableContent
    );
    if (!roots?.length) return;
    // Include coarser first-image fallbacks too. Disk byte counts are not a
    // GPU budget: use measured residency, conservatively estimate absent data.
    const resident = new Map<string, number>();
    this.tiles.traverse((tile) => {
      const url = resolveTileContentUrl(tile as RuntimeTile);
      if (url && this.stored.has(url))
        resident.set(url, this.tiles.lruCache.getMemoryUsage(tile) || 0);
    });
    const residentBytes = Math.max(
      this.manifest?.residentBytes ?? 0,
      [...this.stored].reduce(
        (sum, url) =>
          sum +
          Math.max(
            resident.get(url) ?? 0,
            (this.storedBytes.get(url) ?? 0) * 2
          ),
        0
      )
    );
    if (!residentBytes || residentBytes > this.options.memoryBudget()) return;
    // Include already prepared coarser fallbacks for native first-image traversal.
    const manifest: MeshBaseManifest = {
      sourceUrl: meshBaseCacheSourceUrl(this.options.sourceUrl),
      sourceRevision: this.revision,
      buildId: this.options.buildId,
      extentError: Math.max(...roots.map((tile) => tile.geometricError)),
      residentBytes,
      urls: [...this.stored].sort(),
    };
    if (
      this.manifest &&
      JSON.stringify(this.manifest) === JSON.stringify(manifest)
    )
      return;
    this.confirming = true;
    void this.request(
      { operation: MESH_BASE_CACHE_OPERATION.confirm, manifest },
      5000
    ).then((saved) => {
      this.confirming = false;
      if (saved !== true) return;
      this.manifest = manifest;
      this.confirmedUrls = new Set(manifest.urls);
      this.stats.confirmed = true;
      void navigator.storage?.persist?.().catch(() => false);
    });
  };

  private stopWorker() {
    this.worker?.terminate();
    this.worker = null;
    for (const done of this.jobs.values()) done(null);
    this.jobs.clear();
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    this.pendingWrites.clear();
  }
  dispose() {
    this.disposed = true;
    this.stopWorker();
    this.tiles?.removeEventListener("update-after", this.updateAfter);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.pendingWrites.clear();
    this.pendingBytes = 0;
    for (const value of this.prepared.values()) {
      value.cleanup();
      closeRecord(value.record);
    }
    this.prepared.clear();
  }
}
