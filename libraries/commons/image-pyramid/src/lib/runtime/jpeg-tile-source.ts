import type { DevicePixels } from "@carma-units";
import type { ImageLevel, ImageSize } from "../core/image-level-plan";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
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
    priority: "high" | "low" = "high"
  ) {
    await Promise.all(
      [...new Set(tiles.map((tile) => tile.level))].map((level) =>
        abortable(this.blob(level, priority), signal)
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
  }

  /** Exact level sizes come from each file's SOF header, read with one small range each. */
  private async load(signal: AbortSignal): Promise<ImagePyramid> {
    const sizes = await Promise.all(
      this.levelNumbers.map(async (level) => {
        try {
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
          const blob = await response.blob();
          if (response.status === 200) this.keep(level, blob);
          return { level, ...(await readJpegImageSize(blob, signal)) };
        } catch (error) {
          signal.throwIfAborted();
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

  private blob(level: number, priority: "high" | "low") {
    const resident = this.blobs.get(level);
    if (resident) return Promise.resolve(resident);
    let request = this.loading.get(level);
    if (!request) {
      request = (async () => {
        this.requests++;
        const response = await fetch(this.levelUrl(level), {
          signal: this.downloads.signal,
          priority,
        });
        if (!response.ok)
          throw new Error(`JPEG level ${level} answered ${response.status}`);
        const blob = await response.blob();
        this.keep(level, blob);
        return blob;
      })().finally(() => this.loading.delete(level));
      this.loading.set(level, request);
    }
    return request;
  }

  private keep(level: number, blob: Blob) {
    this.bytes += blob.size - (this.blobs.get(level)?.size ?? 0);
    this.blobs.set(level, blob);
  }
}
