import type { Tile } from "3d-tiles-renderer/core";
import { Matrix4, type Object3D } from "three";
import {
  snapshotMeshBaseRenderRecord,
  type MeshBaseRenderRecord,
} from "../../core/mesh-base-render-record";
import {
  MESH_BASE_CACHE_OPERATION,
  MESH_BASE_RENDER_FORMAT,
  meshBaseCacheSourceUrl,
  meshBaseCacheIdentity,
  meshBaseManifestMatches,
  type MeshBaseCacheTree,
  type MeshBaseManifest,
} from "../../core/mesh-base-cache-protocol";
import { meshBaseContentLineage } from "../../core/mesh-base-cache-tree";
import {
  prepareMeshBaseManifest,
  getMeshBaseContentUrl,
  invalidateMeshBaseRenderer,
} from "./mesh-base-cache-manifest";
import {
  requestMeshBaseCache,
  bindMeshBaseCacheWorker,
  closeMeshBaseRecord,
  type MeshCacheRequest,
  type MeshCacheJob,
} from "./mesh-base-cache-request";
import {
  createMeshBasePayload,
  meshBasePayloadId,
  parseMeshBasePayload,
  restoreMeshBasePayload,
  type MeshBaseNativeRenderer,
} from "./mesh-base-cache-payload";
import { createPersistentTileUsageQueue } from "./persistent-tile-usage";
import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";

/** Optional cache I/O; TilesRenderer owns traversal, publication and disposal. */
export class MeshBaseCachePlugin {
  readonly name = "CARMA_MESH_BASE_CACHE";
  readonly priority = -200;
  private tiles!: MeshBaseNativeRenderer;
  private readonly parseSignals = new WeakMap<Tile, AbortSignal>();
  private worker: Worker | null = null;
  private revision = "";
  private sequence = 0;
  private identity = "";
  private generation = 0;
  private initializationAttempt = 0;
  private sourceTransition = false;
  private disposed = false;
  private confirming = false;
  private lastAudit = 0;
  private manifest: MeshBaseManifest | null = null;
  private confirmedUrls = new Set<string>();
  private stored = new Set<string>();
  private writing = new Set<string>();
  private usage = this.createUsageQueue();
  private pendingBytes = 0;
  private readonly pendingWrites = new Map<
    string,
    { record: MeshBaseRenderRecord; tree: MeshBaseCacheTree }
  >();
  private readonly storedBytes = new Map<string, number>();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private prepared = new Map<
    number,
    { record: MeshBaseRenderRecord; cleanup: () => void }
  >();
  private jobs = new Map<number, MeshCacheJob>();
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
      fetchSource: (
        url: string,
        options: RequestInit
      ) => Promise<Response | ArrayBuffer>;
      prepareModel?: (
        scene: Object3D,
        tile: Tile,
        signal?: AbortSignal
      ) => Promise<void>;
    }
  ) {}

  init(tiles: RuntimeTilesRenderer) {
    this.tiles = tiles as MeshBaseNativeRenderer;
    tiles.addEventListener("update-after", this.updateAfter);
    tiles.addEventListener("tile-visibility-change", this.visibilityChanged);
  }
  getStats() {
    return {
      ...this.stats,
      pendingBytes: this.pendingBytes,
      manifest: this.manifest,
    };
  }

  private createUsageQueue() {
    return createPersistentTileUsageQueue<string>({
      key: (url) => url,
      write: async (values) => {
        const nodes = values.filter((url) => this.stored.has(url));
        this.usage.note(
          values.filter(
            (url) =>
              !this.stored.has(url) &&
              (this.pendingWrites.has(url) || this.writing.has(url))
          )
        );
        if (nodes.length)
          await this.request(
            { operation: MESH_BASE_CACHE_OPERATION.markUsed, nodes },
            5000
          );
      },
    });
  }

  private request(data: MeshCacheRequest, deadline = 200) {
    return requestMeshBaseCache(
      this.disposed ? null : this.worker,
      data,
      ++this.sequence,
      this.jobs,
      () => {
        this.confirmedUrls.clear();
        this.stats.confirmed = false;
      },
      deadline
    );
  }

  /** The existing hierarchy loader validates the root before calling this. */
  async initialize(document: object) {
    if (this.disposed) return;
    const attempt = ++this.initializationAttempt;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(document));
      const revision = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0")
      ).join("");
      if (this.disposed || attempt !== this.initializationAttempt) return;
      const identity = meshBaseCacheIdentity({
        ...this.options,
        sourceRevision: revision,
      });
      if (identity === this.identity && this.worker) return;
      const replacingSource =
        this.identity !== "" && identity !== this.identity;
      this.sourceTransition = true;
      if (replacingSource) {
        invalidateMeshBaseRenderer(this.tiles);
        await this.request({ operation: MESH_BASE_CACHE_OPERATION.invalidate });
        if (this.disposed || attempt !== this.initializationAttempt) return;
      }
      this.stopWorker();
      this.revision = revision;
      this.identity = identity;
      this.worker = new Worker(
        new URL("./mesh-base-cache.worker.ts", import.meta.url),
        { type: "module" }
      );
      const generation = this.generation;
      const worker = this.worker;
      bindMeshBaseCacheWorker(
        worker,
        this.jobs,
        (manifest) => {
          if (
            generation === this.generation &&
            worker === this.worker &&
            !this.sourceTransition
          )
            this.acceptManifest(manifest);
        },
        () => {
          if (this.worker === worker) this.stopWorker();
        }
      );
      const saved = await this.request(
        {
          operation: MESH_BASE_CACHE_OPERATION.initialize,
          sourceUrl: meshBaseCacheSourceUrl(this.options.sourceUrl),
          sourceRevision: this.revision,
          buildId: this.options.buildId,
        },
        200
      );
      if (
        generation === this.generation &&
        saved &&
        typeof saved === "object" &&
        "urls" in saved
      )
        this.acceptManifest(saved);
      if (replacingSource) invalidateMeshBaseRenderer(this.tiles);
      if (attempt === this.initializationAttempt) this.sourceTransition = false;
    } catch {
      if (attempt === this.initializationAttempt) {
        this.stopWorker();
        this.sourceTransition = false;
      }
    }
  }

  private acceptManifest(saved: MeshBaseManifest) {
    if (
      this.disposed ||
      !meshBaseManifestMatches(saved, {
        ...this.options,
        sourceRevision: this.revision,
      }) ||
      saved.residentBytes > this.options.memoryBudget()
    )
      return;
    this.manifest = saved;
    this.confirmedUrls = new Set(saved.urls);
    this.stored = new Set(saved.urls);
    this.stats.confirmed = true;
    this.options.onConfirmed();
  }

  fetchData(
    url: string,
    options: RequestInit
  ): Promise<Response | ArrayBuffer> | null {
    if (this.sourceTransition || !this.confirmedUrls.has(url) || !this.worker)
      return null;
    return (async () => {
      const identity = this.identity;
      const start = performance.now();
      const result = await this.request({
        operation: MESH_BASE_CACHE_OPERATION.get,
        url,
      });
      this.stats.readMs += performance.now() - start;
      if (
        options.signal?.aborted ||
        this.disposed ||
        identity !== this.identity
      ) {
        if (result && typeof result === "object" && "textures" in result)
          closeMeshBaseRecord(result);
        options.signal?.throwIfAborted();
        throw new DOMException("Disposed", "AbortError");
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("textures" in result) ||
        result.version !== MESH_BASE_RENDER_FORMAT ||
        result.cacheIdentity !== this.identity ||
        result.contentUrl !== url
      ) {
        if (result && typeof result === "object" && "textures" in result)
          closeMeshBaseRecord(result);
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
          closeMeshBaseRecord(value.record);
        }
        this.prepared.delete(id);
      };
      options.signal?.addEventListener("abort", cancel, { once: true });
      this.prepared.set(id, {
        record: result,
        cleanup: () => options.signal?.removeEventListener("abort", cancel),
      });
      this.stats.hits++;
      return new Response(createMeshBasePayload(id));
    })();
  }

  parseTile(
    buffer: ArrayBuffer,
    tile: Tile,
    extension: string,
    url: string,
    signal: AbortSignal
  ) {
    this.parseSignals.set(tile, signal);
    return parseMeshBasePayload(
      this.tiles,
      { buffer, tile, extension, url, signal },
      this.options.fetchSource,
      () => {
        this.confirmedUrls.delete(url);
        this.stored.delete(url);
        this.stats.confirmed = false;
      }
    );
  }

  parseToMesh(buffer: ArrayBuffer) {
    const id = meshBasePayloadId(buffer);
    if (id === null) return null;
    const prepared = this.prepared.get(id);
    if (!prepared) throw new Error("Missing prepared mesh record");
    this.prepared.delete(id);
    prepared.cleanup();
    const restored = restoreMeshBasePayload(prepared.record);
    this.stats.restoreMs += restored.restoreMs;
    return restored.model;
  }

  async processTileModel(scene: Object3D, tile: Tile) {
    if (this.options.prepareModel)
      await this.options.prepareModel(scene, tile, this.parseSignals.get(tile));
    if (this.disposed) return;
    const runtime = tile as RuntimeTile;
    const url = resolveTileContentUrl(runtime);
    if (
      !url ||
      this.sourceTransition ||
      !this.worker ||
      !this.revision ||
      this.stored.has(url) ||
      this.writing.has(url) ||
      this.pendingWrites.has(url) ||
      tile.geometricError < this.options.extentError()
    )
      return;
    // Snapshot before application styling can replace original materials.
    const tree = meshBaseContentLineage(
      runtime,
      this.identity,
      getMeshBaseContentUrl,
      (tile) => tile.parent as RuntimeTile | null
    );
    if (
      !tree ||
      (tree.parent &&
        !this.stored.has(tree.parent) &&
        !this.pendingWrites.has(tree.parent) &&
        !this.writing.has(tree.parent))
    )
      return;
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
    // Clone source buffers one at a time only after the view converges.
    this.pendingWrites.set(url, { record, tree });
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
      const ready = [...this.pendingWrites].find(
        ([, item]) => !item.tree.parent || this.stored.has(item.tree.parent)
      );
      if (!ready) {
        // Missing/evicted ancestors invalidate optional child snapshots.
        this.pendingWrites.clear();
        this.pendingBytes = 0;
        return;
      }
      const [url, { record, tree }] = ready;
      const generation = this.generation;
      this.pendingWrites.delete(url);
      this.writing.add(url);
      void this.request(
        { operation: MESH_BASE_CACHE_OPERATION.put, url, record, tree },
        5000
      ).then((saved) => {
        if (generation !== this.generation) return;
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

  private visibilityChanged = (event: { tile: Tile; visible: boolean }) => {
    if (!event.visible || this.sourceTransition || !this.worker) return;
    const url = resolveTileContentUrl(event.tile as RuntimeTile);
    if (
      url &&
      (this.stored.has(url) ||
        this.pendingWrites.has(url) ||
        this.writing.has(url))
    )
      this.usage.note([url]);
  };

  private updateAfter = () => {
    if (
      this.disposed ||
      this.sourceTransition ||
      !this.worker ||
      this.confirming ||
      !this.options.canPrepare() ||
      performance.now() - this.lastAudit < 1000
    )
      return;
    this.lastAudit = performance.now();
    void this.usage.flush();
    const manifest = prepareMeshBaseManifest(
      this.tiles,
      { ...this.options, sourceRevision: this.revision },
      this.stored,
      this.storedBytes,
      this.options.memoryBudget()
    );
    if (!manifest) return;
    if (
      this.manifest &&
      JSON.stringify(this.manifest) === JSON.stringify(manifest)
    )
      return;
    this.confirming = true;
    const generation = this.generation;
    void this.request(
      { operation: MESH_BASE_CACHE_OPERATION.confirm, manifest },
      5000
    ).then((saved) => {
      if (generation !== this.generation) return;
      this.confirming = false;
      if (saved !== true) return;
      this.manifest = manifest;
      this.confirmedUrls = new Set(manifest.urls);
      this.stats.confirmed = true;
      void navigator.storage?.persist?.().catch(() => false);
    });
  };

  private stopWorker() {
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    for (const done of this.jobs.values()) done(null);
    this.jobs.clear();
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    this.pendingWrites.clear();
    this.pendingBytes = 0;
    this.writing.clear();
    this.stored.clear();
    this.storedBytes.clear();
    this.usage.close();
    if (!this.disposed) this.usage = this.createUsageQueue();
    this.confirmedUrls.clear();
    this.manifest = null;
    this.stats.confirmed = false;
    this.confirming = false;
    this.lastAudit = 0;
    for (const value of this.prepared.values()) {
      value.cleanup();
      closeMeshBaseRecord(value.record);
    }
    this.prepared.clear();
  }
  dispose() {
    this.disposed = true;
    this.initializationAttempt++;
    this.stopWorker();
    this.tiles?.removeEventListener("update-after", this.updateAfter);
    this.tiles?.removeEventListener(
      "tile-visibility-change",
      this.visibilityChanged
    );
  }
}
