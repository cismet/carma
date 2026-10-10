import type { DevicePixels } from "@carma-units";
import type { ImageLevel, ImageSize } from "../core/image-level-plan";
import {
  ImagePrefetchBudgetExceeded,
  reserveImagePrefetchBytes,
  type ImagePrefetchBudget,
} from "./image-tile-source";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
  ImageTileFetchContext,
} from "./image-tile-source";
import { abortable } from "./avif-tile-source";
import { readJpegImageSize } from "./jpeg-image-size";

const TILE = 512;
const HEADER_BYTES = 64 * 1024;
/** Whole-level decodes are shared by tile requests arriving within this window. */
const DECODE_WINDOW_MS = 400;

/**
 * Legacy JPEG pyramids stored as one file per level (`/{level}/{id}.jpg`).
 * A level is decoded once per burst and cut into virtual 512 tiles, so the
 * renderer and scheduler treat it exactly like a tiled AVIF level.
 */
export class JpegTileSource implements ImageTileSource {
  readonly kind = "jpeg" as const;
  priority: "high" | "low" = "high";
  prefetchBudget?: ImagePrefetchBudget;
  private readonly levelBytes = new Map<number, number>();
  /** Successful full-level responses only; retained when compressed blobs leave RAM. */
  private readonly levelRevisions = new Map<number, string | undefined>();
  private pyramid: Promise<ImagePyramid> | null = null;
  private readonly blobs = new Map<number, Blob>();
  private readonly loading = new Map<number, Promise<Blob>>();
  private readonly decoded = new Map<
    number,
    { bitmap: Promise<ImageBitmap>; timer?: ReturnType<typeof setTimeout> }
  >();
  private requests = 0;
  private bytes = 0;
  private readonly controller = new AbortController();
  /** Level downloads only; replaced on pause so the size probe survives. */
  private downloads = new AbortController();

  constructor(
    readonly url: string,
    private readonly native: ImageSize,
    private readonly levelNumbers: readonly number[] = [0, 1, 2, 3, 4, 5, 6]
  ) {}

  get compressedBytes() {
    return this.bytes;
  }
  get cacheRevision() {
    return this.levelRevisions.get(Math.max(...this.levelRevisions.keys()));
  }
  get requestCount() {
    return this.requests;
  }

  levelUrl(level: number) {
    const url = new URL(this.url);
    url.pathname = url.pathname.replace(/\/[0-9]+\/(?=[^/]+$)/, `/${level}/`);
    return url.href;
  }

  open(signal: AbortSignal) {
    this.pyramid ??= this.load(this.controller.signal);
    return abortable(this.pyramid, signal);
  }

  hasBytes(tile: ImageTileRef) {
    return this.blobs.has(tile.level);
  }

  async fetch(
    tiles: readonly ImageTileRef[],
    signal: AbortSignal,
    priority: "high" | "low" = "high",
    _onTileReady?: (tile: ImageTileRef) => void,
    context?: ImageTileFetchContext
  ) {
    const requestContext: ImageTileFetchContext = {
      prefetchBudget:
        context === undefined ? this.prefetchBudget : context.prefetchBudget,
    };
    await Promise.all(
      [...new Set(tiles.map((tile) => tile.level))].map((level) =>
        abortable(this.blob(level, priority, requestContext), signal)
      )
    );
  }

  async decode(tile: ImageTileRef, signal: AbortSignal): Promise<ImageBitmap> {
    const blob = await abortable(this.blob(tile.level, "high"), signal);
    let entry = this.decoded.get(tile.level);
    if (!entry) {
      entry = { bitmap: createImageBitmap(blob) };
      this.decoded.set(tile.level, entry);
    }
    clearTimeout(entry.timer);
    const current = entry;
    current.timer = setTimeout(() => {
      if (this.decoded.get(tile.level) !== current) return;
      this.decoded.delete(tile.level);
      void current.bitmap.then(
        (bitmap) => bitmap.close(),
        () => undefined
      );
    }, DECODE_WINDOW_MS);
    const whole = await abortable(current.bitmap, signal);
    const x = tile.col * TILE,
      y = tile.row * TILE;
    return createImageBitmap(
      whole,
      x,
      y,
      Math.min(TILE, whole.width - x),
      Math.min(TILE, whole.height - y)
    );
  }

  trimCompressedTo(maxBytes: number) {
    const limit = Math.max(0, maxBytes);
    const floor = Math.max(...this.blobs.keys());
    for (const [level, blob] of [...this.blobs].sort(([a], [b]) => a - b)) {
      if (this.bytes <= limit) break;
      if (level === floor) continue;
      this.blobs.delete(level);
      this.bytes -= blob.size;
    }
  }

  pause() {
    this.downloads.abort();
    this.downloads = new AbortController();
  }

  dispose() {
    this.controller.abort();
    this.downloads.abort();
    for (const entry of this.decoded.values()) {
      clearTimeout(entry.timer);
      void entry.bitmap.then(
        (bitmap) => bitmap.close(),
        () => undefined
      );
    }
    this.decoded.clear();
    this.blobs.clear();
    this.levelRevisions.clear();
  }

  /** Exact level sizes come from each file's SOF header, read with one small range each. */
  private async load(signal: AbortSignal): Promise<ImagePyramid> {
    const prefetchBudget = this.prefetchBudget;
    const sizes = await Promise.all(
      this.levelNumbers.map(async (level) => {
        try {
          reserveImagePrefetchBytes(prefetchBudget, HEADER_BYTES);
          this.requests++;
          const response = await fetch(this.levelUrl(level), {
            headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
            priority: this.priority,
            signal,
          });
          if (!response.ok) {
            await response.body?.cancel();
            return null;
          }
          const total = Number(
            response.status === 206
              ? response.headers.get("Content-Range")?.split("/")[1]
              : response.headers.get("Content-Length")
          );
          if (Number.isSafeInteger(total) && total > 0)
            this.levelBytes.set(level, total);
          if (
            prefetchBudget &&
            response.status !== 206 &&
            (!total || total > HEADER_BYTES)
          ) {
            await response.body?.cancel();
            throw new ImagePrefetchBudgetExceeded();
          }
          const blob = await response.blob();
          if (response.status === 200 || (total > 0 && blob.size === total)) {
            this.keep(level, blob);
            this.recordRevision(level, response, blob.size);
          }
          return { level, ...(await readJpegImageSize(blob, signal)) };
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof ImagePrefetchBudgetExceeded) throw error;
          return null;
        }
      })
    );
    const levels: ImageLevel[] = sizes
      .filter((size): size is NonNullable<typeof size> => !!size)
      .map(({ level, width, height }) => ({
        level,
        width: width as DevicePixels,
        height: height as DevicePixels,
        tileWidth: Math.min(TILE, width) as DevicePixels,
        tileHeight: Math.min(TILE, height) as DevicePixels,
        cols: Math.ceil(width / TILE),
        rows: Math.ceil(height / TILE),
      }));
    if (!levels.length) throw new Error("No JPEG pyramid level is available");
    return { native: this.native, levels };
  }

  private blob(
    level: number,
    priority: "high" | "low",
    context: ImageTileFetchContext = { prefetchBudget: this.prefetchBudget }
  ) {
    const prefetchBudget = context.prefetchBudget;
    const resident = this.blobs.get(level);
    if (resident) return Promise.resolve(resident);
    let request = this.loading.get(level);
    if (!request) {
      request = (async () => {
        const bytes = this.levelBytes.get(level);
        // Unknown full-level lengths are never speculative downloads.
        if (prefetchBudget && bytes === undefined)
          throw new ImagePrefetchBudgetExceeded();
        reserveImagePrefetchBytes(prefetchBudget, bytes ?? 0);
        this.requests++;
        const response = await fetch(this.levelUrl(level), {
          headers: prefetchBudget
            ? { Range: `bytes=0-${bytes! - 1}` }
            : undefined,
          signal: this.downloads.signal,
          priority,
        });
        if (!response.ok)
          throw new Error(`JPEG level ${level} answered ${response.status}`);
        const length = Number(response.headers.get("Content-Length"));
        const total = Number(
          response.headers.get("Content-Range")?.split("/")[1]
        );
        if (
          prefetchBudget &&
          (length > (bytes ?? 0) ||
            total > (bytes ?? 0) ||
            (response.status !== 206 && (!length || length > (bytes ?? 0))))
        ) {
          await response.body?.cancel();
          throw new ImagePrefetchBudgetExceeded();
        }
        const blob = await response.blob();
        this.keep(level, blob);
        if (response.status === 200 || (total > 0 && blob.size === total))
          this.recordRevision(level, response, blob.size);
        return blob;
      })().finally(() => this.loading.delete(level));
      this.loading.set(level, request);
    }
    return request;
  }

  private recordRevision(level: number, response: Response, bytes: number) {
    const etag = response.headers.get("ETag");
    const modified = response.headers.get("Last-Modified");
    this.levelRevisions.set(
      level,
      etag || modified
        ? JSON.stringify([
            response.url || this.levelUrl(level),
            etag,
            modified,
            bytes,
          ])
        : undefined
    );
  }

  private keep(level: number, blob: Blob) {
    this.bytes += blob.size - (this.blobs.get(level)?.size ?? 0);
    this.blobs.set(level, blob);
  }
}
