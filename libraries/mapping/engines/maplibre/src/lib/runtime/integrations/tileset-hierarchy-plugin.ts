import {
  createTilesetHierarchyPageReader,
  type TilesetDescriptor,
} from "../../core/tileset-hierarchy-page";
import {
  HIERARCHY_OPERATION,
  HIERARCHY_RESULT,
  type HierarchyRequest,
  type HierarchyResponse,
} from "../../core/tileset-hierarchy-protocol";
import { fetchTileResponse } from "./fetch-tile-response";

type Job = {
  resolve: (value: HierarchyResponse) => void;
  reject: (reason: unknown) => void;
  cleanup: () => void;
};

/** Native fetchData plugin, not a second traversal/LOD engine. Static pages are
 * restored on demand; the renderer still owns its original external-root links.
 * Decision: TILE-SPARSE-HIERARCHY-INDEX-20260909 in engines/maplibre/README.md.
 */
export class TilesetHierarchyPlugin {
  readonly name = "CARMA_TILESET_HIERARCHY";
  readonly priority = -100;
  private worker: Worker | null = null;
  private disabled = false;
  private disposed = false;
  private sequence = 0;
  private readonly jobs = new Map<number, Job>();
  private readonly stats = { cacheHits: 0, cacheMisses: 0, fallbacks: 0 };
  getStats() {
    return { ...this.stats };
  }

  constructor(private readonly rootUrl: string) {}

  private stop(reason: unknown) {
    this.disabled = true;
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.jobs.values()) {
      job.cleanup();
      job.reject(reason);
    }
    this.jobs.clear();
  }

  private request(
    url: string,
    options: RequestInit
  ): Promise<HierarchyResponse> {
    if (this.disabled || this.disposed || typeof Worker === "undefined")
      return Promise.reject(new Error("Hierarchy worker unavailable"));
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./tileset-hierarchy.worker.ts", import.meta.url),
        { type: "module" }
      );
      this.worker.onmessage = ({ data }: MessageEvent<HierarchyResponse>) => {
        const job = this.jobs.get(data.id);
        if (!job) return;
        job.cleanup();
        this.jobs.delete(data.id);
        if (data.kind === HIERARCHY_RESULT.error)
          job.reject(new Error(data.message));
        else job.resolve(data);
      };
      this.worker.onerror = () =>
        this.stop(new Error("Hierarchy worker failed"));
      this.worker.onmessageerror = () =>
        this.stop(new Error("Hierarchy worker message failed"));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const signal = options.signal;
      const cancel = () => {
        this.worker?.postMessage({
          id,
          operation: HIERARCHY_OPERATION.cancel,
        } satisfies HierarchyRequest);
        const job = this.jobs.get(id);
        if (job) {
          job.cleanup();
          this.jobs.delete(id);
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        }
      };
      const timer = setTimeout(
        () => this.stop(new Error("Hierarchy worker timed out")),
        40_000
      );
      this.jobs.set(id, {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
        },
      });
      if (signal?.aborted) {
        cancel();
        return;
      }
      signal?.addEventListener("abort", cancel, { once: true });
      const { signal: ignored, ...serializable } = options;
      serializable.headers = Array.from(new Headers(options.headers).entries());
      try {
        this.worker!.postMessage({
          id,
          operation: HIERARCHY_OPERATION.load,
          rootUrl: this.rootUrl,
          url,
          options: serializable,
        } satisfies HierarchyRequest);
      } catch (error) {
        this.stop(error);
      }
    });
  }

  fetchData(
    url: string,
    options: RequestInit
  ): Promise<TilesetDescriptor | Response> | null {
    if (
      !/\.json(?:[?#]|$)/i.test(url) ||
      (options.method && options.method !== "GET")
    )
      return null;
    if (this.disposed)
      return Promise.reject(new DOMException("Disposed", "AbortError"));
    return this.load(url, options);
  }

  private async load(
    url: string,
    options: RequestInit
  ): Promise<TilesetDescriptor | Response> {
    let readingCachedPage = false;
    try {
      const result = await this.request(url, options);
      options.signal?.throwIfAborted();
      if (this.disposed) throw new DOMException("Disposed", "AbortError");
      if (result.kind === HIERARCHY_RESULT.document) return result.document;
      if (result.kind !== HIERARCHY_RESULT.page)
        throw new Error("Missing hierarchy page");
      if (result.cached) this.stats.cacheHits++;
      else this.stats.cacheMisses++;
      readingCachedPage = result.cached;
      const reader = createTilesetHierarchyPageReader(result.page);
      let complete = false;
      while (!complete) {
        const started = performance.now();
        for (let i = 0; i < 2048; i++) {
          if (!reader.read()) {
            complete = true;
            break;
          }
          if (performance.now() - started >= 2) break;
        }
        if (!complete) {
          const scheduler = (
            globalThis as unknown as {
              scheduler?: { yield?: () => Promise<void> };
            }
          ).scheduler;
          if (scheduler?.yield) await scheduler.yield();
          else await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        options.signal?.throwIfAborted();
        if (this.disposed) throw new DOMException("Disposed", "AbortError");
      }
      return reader.finish();
    } catch (error) {
      if (this.disposed || options.signal?.aborted) throw error;
      this.stats.fallbacks++;
      if (readingCachedPage)
        this.worker?.postMessage({
          id: ++this.sequence,
          operation: HIERARCHY_OPERATION.invalidate,
          url,
        } satisfies HierarchyRequest);
      // Worker, persistence or codec failure is never a blank-map failure.
      return fetchTileResponse(url, options);
    }
  }

  dispose() {
    this.disposed = true;
    this.stop(new DOMException("Disposed", "AbortError"));
  }
}
