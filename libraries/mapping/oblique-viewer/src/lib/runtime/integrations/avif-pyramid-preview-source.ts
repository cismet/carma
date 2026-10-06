import type { DevicePixels } from "@carma-units";
import type { NativePreviewWindow } from "../../core/utils/native-preview-window";
import {
  parseAvifGridIndex,
  makeAvifTile,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "../../core/utils/avif-grid-index";
import { OffscreenCanvasPool } from "../utils/offscreen-canvas-pool";

type LevelEntry = {
  offset: number;
  length: number;
  width: number;
  height: number;
  scale: number;
  cellsIndex?: { offset: number; length: number };
};
type PyramidIndex = {
  schema: 1;
  format: "avif-independent-pyramid";
  baseLevel: 1;
  sourceSensorDimensions: [number, number];
  levels: Record<string, LevelEntry>;
};
type CellTable = {
  schema: 1;
  level: number;
  cells: { x: number; y: number; itemId: number; ranges: AvifRange[] }[];
};
export type AvifPreviewPage = {
  level: number;
  entry: LevelEntry;
  getWidth: () => number;
  getHeight: () => number;
};
type Grid = {
  index: AvifGridIndex;
  cols: number;
  edgeX: number;
  edgeY: number;
  absolute: Map<number, AvifRange[]>;
};
const LIMIT = 8 * 1024 * 1024;
const concatenate = (parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    output.set(part, at);
    at += part.byteLength;
  }
  return output;
};

/** Existing preview worker backend: bounded native AVIF cell decode, no whole-photo bitmap. */
export class AvifPyramidPreviewSource {
  private index: PyramidIndex | null = null;
  private fileBytes = 0;
  private ranges = new Map<string, Uint8Array>();
  private rangeBytes = 0;
  private grids = new Map<number, Grid>();
  private bitmaps = new Map<string, ImageBitmap>();
  private bitmapBytes = 0;
  private decodeCanvases = new OffscreenCanvasPool({
    maxRetainedBytes: 4 * 1024 * 1024,
    maxRetainedCanvases: 1,
    contextOptions: { willReadFrequently: true },
  });
  private rangeLimit: number;
  private bitmapLimit: number;
  constructor(
    readonly url: string,
    budget = 64 * 1024 * 1024,
    readonly priority?: "low" | "high" | "auto"
  ) {
    this.rangeLimit = Math.min(32 * 1024 * 1024, budget / 3);
    this.bitmapLimit = Math.min(32 * 1024 * 1024, (budget * 2) / 3);
  }
  park(budget: number) {
    this.rangeLimit = Math.min(this.rangeLimit, Math.max(0, budget / 3));
    this.bitmapLimit = Math.min(
      this.bitmapLimit,
      Math.max(0, (budget * 2) / 3)
    );
    while (this.rangeBytes > this.rangeLimit && this.ranges.size) {
      const key = this.ranges.keys().next().value!;
      this.rangeBytes -= this.ranges.get(key)!.length;
      this.ranges.delete(key);
    }
    while (this.bitmapBytes > this.bitmapLimit && this.bitmaps.size) {
      const key = this.bitmaps.keys().next().value!;
      const bitmap = this.bitmaps.get(key)!;
      this.bitmapBytes -= bitmap.width * bitmap.height * 4;
      bitmap.close();
      this.bitmaps.delete(key);
    }
    this.decodeCanvases.trim();
  }
  close() {
    for (const bitmap of this.bitmaps.values()) bitmap.close();
    this.bitmaps.clear();
    this.bitmapBytes = 0;
    this.ranges.clear();
    this.rangeBytes = 0;
    this.grids.clear();
    this.decodeCanvases.trim();
  }
  private async range(
    offset: number,
    length: number,
    signal: AbortSignal
  ): Promise<Uint8Array> {
    signal.throwIfAborted();
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 1 ||
      length > LIMIT ||
      (this.fileBytes && offset + length > this.fileBytes)
    )
      throw Error("Invalid bounded AVIF range");
    const key = `${offset}:${length}`,
      cached = this.ranges.get(key);
    if (cached) {
      this.ranges.delete(key);
      this.ranges.set(key, cached);
      return cached;
    }
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
      priority: this.priority,
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw Error(
        `AVIF requires HTTP 206; refusing ${response.status} full-file response`
      );
    }
    const declared = response.headers.get("Content-Length"),
      contentRange = response.headers.get("Content-Range");
    if (declared !== null && Number(declared) !== length) {
      await response.body?.cancel();
      throw Error("AVIF range length mismatch");
    }
    if (contentRange) {
      const parsed = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
      if (
        !parsed ||
        Number(parsed[1]) !== offset ||
        Number(parsed[2]) !== offset + length - 1 ||
        Number(parsed[3]) !== this.fileBytes
      ) {
        await response.body?.cancel();
        throw Error("AVIF Content-Range mismatch");
      }
    }
    const bytes = new Uint8Array(length),
      reader = response.body?.getReader();
    if (!reader) throw Error("AVIF range response has no body");
    let received = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        if (received + chunk.value.byteLength > length) {
          await reader.cancel();
          throw Error("AVIF range body exceeds requested budget");
        }
        bytes.set(chunk.value, received);
        received += chunk.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    signal.throwIfAborted();
    if (received !== length) throw Error("Incomplete AVIF range");
    if (bytes.length <= this.rangeLimit) {
      this.ranges.set(key, bytes);
      this.rangeBytes += bytes.length;
      while (this.rangeBytes > this.rangeLimit) {
        const oldest = this.ranges.keys().next().value!;
        this.rangeBytes -= this.ranges.get(oldest)!.length;
        this.ranges.delete(oldest);
      }
    }
    return bytes;
  }
  private async metadata(signal: AbortSignal): Promise<PyramidIndex> {
    if (this.index) return this.index;
    const head = await fetch(this.url, {
      method: "HEAD",
      cache: "no-cache",
      signal,
      priority: this.priority,
    });
    signal.throwIfAborted();
    if (!head.ok) throw Error(`AVIF metadata unavailable (${head.status})`);
    this.fileBytes = Number(head.headers.get("Content-Length"));
    if (!Number.isSafeInteger(this.fileBytes) || this.fileBytes < 4112)
      throw Error("AVIF packed length missing");
    const footer = await this.range(this.fileBytes - 16, 16, signal);
    if (new TextDecoder().decode(footer.subarray(0, 8)) !== "pyridx01")
      throw Error("AVIF pyramid locator missing");
    const at = Number(
      new DataView(
        footer.buffer,
        footer.byteOffset,
        footer.byteLength
      ).getBigUint64(8)
    );
    if (!Number.isSafeInteger(at) || at < 24 || at + 4096 > this.fileBytes - 16)
      throw Error("Invalid AVIF pyramid index");
    const parsed = JSON.parse(
      new TextDecoder()
        .decode(await this.range(at, 4096, signal))
        .replace(/\0+$/, "")
    ) as PyramidIndex;
    if (
      parsed.schema !== 1 ||
      parsed.format !== "avif-independent-pyramid" ||
      parsed.baseLevel !== 1 ||
      !parsed.levels?.[1] ||
      !Array.isArray(parsed.sourceSensorDimensions) ||
      parsed.sourceSensorDimensions.length !== 2
    )
      throw Error("Unsupported calibrated AVIF pyramid");
    for (const entry of Object.values(parsed.levels)) {
      if (
        !Number.isSafeInteger(entry.offset) ||
        !Number.isSafeInteger(entry.length) ||
        entry.offset < 0 ||
        entry.length < 1 ||
        entry.offset + entry.length > this.fileBytes ||
        !Number.isSafeInteger(entry.width) ||
        !Number.isSafeInteger(entry.height) ||
        entry.width < 1 ||
        entry.height < 1 ||
        !Number.isFinite(entry.scale) ||
        entry.scale <= 0
      )
        throw Error("Invalid AVIF level index");
    }
    signal.throwIfAborted();
    this.index = parsed;
    return parsed;
  }
  async select(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    maxDisplayPixelsPerSourcePixel = 1
  ) {
    if (
      !(maxDisplayPixelsPerSourcePixel > 0) ||
      !Number.isFinite(maxDisplayPixelsPerSourcePixel)
    )
      throw Error("Invalid AVIF initial pixel size");
    signal.throwIfAborted();
    const index = await this.metadata(signal);
    signal.throwIfAborted();
    if (
      index.sourceSensorDimensions[0] !== nativeSize.width ||
      index.sourceSensorDimensions[1] !== nativeSize.height
    )
      throw Error("AVIF sensor dimensions do not match camera calibration");
    const pages = Object.entries(index.levels)
      .map(
        ([level, entry]): AvifPreviewPage => ({
          level: Number(level),
          entry,
          getWidth: () => entry.width,
          getHeight: () => entry.height,
        })
      )
      .sort((a, b) => a.level - b.level);
    for (const page of pages) {
      if (
        page.entry.width !== Math.ceil(nativeSize.width * page.entry.scale) ||
        page.entry.height !== Math.ceil(nativeSize.height * page.entry.scale)
      )
        throw Error("AVIF level scale does not match sensor extent");
    }
    const densityX = window.target.width / window.source.width,
      densityY = window.target.height / window.source.height;
    const choose = (factor: number) =>
      [...pages]
        .reverse()
        .find(
          (p) =>
            p.getWidth() / nativeSize.width >= densityX / factor &&
            p.getHeight() / nativeSize.height >= densityY / factor
        ) ?? pages[0]!;
    const initial = choose(maxDisplayPixelsPerSourcePixel),
      finest = choose(1),
      refinements = pages
        .filter((p) => p.level < initial.level && p.level >= finest.level)
        .reverse();
    return { image: initial, refinements };
  }
  private async grid(
    page: AvifPreviewPage,
    signal: AbortSignal
  ): Promise<Grid> {
    const cached = this.grids.get(page.level);
    if (cached) return cached;
    const entry = page.entry;
    let header = await this.range(
      entry.offset,
      Math.min(8192, entry.length),
      signal
    );
    for (let at = 0; at + 8 <= header.length; ) {
      const size = new DataView(header.buffer, header.byteOffset).getUint32(at),
        type = String.fromCharCode(...header.subarray(at + 4, at + 8));
      if (size < 8) throw Error("Invalid AVIF BMFF box");
      if (type === "meta" && at + size > header.length) {
        if (at + size > 256 * 1024 || at + size > entry.length)
          throw Error("AVIF metadata exceeds budget");
        header = concatenate([
          header,
          await this.range(
            entry.offset + header.length,
            at + size - header.length,
            signal
          ),
        ]);
        break;
      }
      at += size;
    }
    const index = parseAvifGridIndex(header);
    if (
      index.dimensions.width !== entry.width ||
      index.dimensions.height !== entry.height
    )
      throw Error("AVIF BMFF/index dimension mismatch");
    let cols = 1;
    const absolute = new Map<number, AvifRange[]>();
    if (index.cells.length) {
      const extent = index.primary.ranges[0];
      if (!extent) throw Error("Missing AVIF grid descriptor");
      let descriptor = header.subarray(
        extent.offset,
        extent.offset + extent.length
      );
      if (descriptor.length !== extent.length)
        descriptor = await this.range(
          entry.offset + extent.offset,
          extent.length,
          signal
        );
      cols = descriptor[3] + 1;
    } else index.cells = [index.primary];
    if (entry.cellsIndex) {
      const table = JSON.parse(
        new TextDecoder().decode(
          await this.range(
            entry.cellsIndex.offset,
            entry.cellsIndex.length,
            signal
          )
        )
      ) as CellTable;
      if (
        table.schema !== 1 ||
        table.level !== page.level ||
        !Array.isArray(table.cells)
      )
        throw Error("Invalid AVIF absolute cell index");
      for (const cell of table.cells) {
        for (const r of cell.ranges)
          if (
            !Number.isSafeInteger(r.offset) ||
            !Number.isSafeInteger(r.length) ||
            r.length < 1 ||
            r.offset < entry.offset ||
            r.offset + r.length > entry.offset + entry.length
          )
            throw Error("Absolute AVIF cell range outside selected level");
        absolute.set(cell.itemId, cell.ranges);
      }
    }
    const ispe = index.cells[0]?.properties.find((p) => p.type === "ispe");
    if (!ispe) throw Error("Missing AVIF cell dimensions");
    const view = new DataView(Uint8Array.from(ispe.bytes).buffer),
      edgeX = view.getUint32(12),
      edgeY = view.getUint32(16);
    if (edgeX < 1 || edgeY < 1 || edgeX > 4096 || edgeY > 4096)
      throw Error("AVIF cell exceeds decode budget");
    const result = { index, cols, edgeX, edgeY, absolute };
    this.grids.set(page.level, result);
    return result;
  }
  private async cell(
    page: AvifPreviewPage,
    grid: Grid,
    item: AvifItem,
    signal: AbortSignal
  ) {
    const key = `${page.level}:${item.id}`,
      cached = this.bitmaps.get(key);
    if (cached) {
      this.bitmaps.delete(key);
      this.bitmaps.set(key, cached);
      return { bitmap: cached, retained: true };
    }
    const ranges =
      grid.absolute.get(item.id) ??
      item.ranges.map((r) => ({
        offset: r.offset + page.entry.offset,
        length: r.length,
      }));
    const payload = concatenate(
      await Promise.all(
        ranges.map((r) => this.range(r.offset, r.length, signal))
      )
    );
    signal.throwIfAborted();
    const bytes = makeAvifTile(grid.index, item, payload),
      bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/avif" }),
        { premultiplyAlpha: "none" }
      );
    if (signal.aborted) {
      bitmap.close();
      signal.throwIfAborted();
    }
    const size = bitmap.width * bitmap.height * 4;
    let retained = false;
    if (size <= this.bitmapLimit) {
      this.bitmaps.set(key, bitmap);
      this.bitmapBytes += size;
      retained = true;
      while (this.bitmapBytes > this.bitmapLimit) {
        const oldest = this.bitmaps.keys().next().value!;
        const old = this.bitmaps.get(oldest)!;
        this.bitmapBytes -= old.width * old.height * 4;
        old.close();
        this.bitmaps.delete(oldest);
      }
    }
    return { bitmap, retained };
  }
  async read(
    page: AvifPreviewPage,
    bounds: [number, number, number, number],
    signal: AbortSignal
  ): Promise<Uint8ClampedArray> {
    signal.throwIfAborted();
    const grid = await this.grid(page, signal),
      [left, top, right, bottom] = bounds,
      width = right - left,
      height = bottom - top;
    if (
      !bounds.every(Number.isSafeInteger) ||
      left < 0 ||
      top < 0 ||
      right > page.getWidth() ||
      bottom > page.getHeight() ||
      width < 1 ||
      height < 1 ||
      width * height > 4 * 1024 * 1024
    )
      throw Error("AVIF ROI exceeds viewport budget");
    const output = new Uint8ClampedArray(width * height * 4);
    for (
      let y = Math.floor(top / grid.edgeY);
      y < Math.ceil(bottom / grid.edgeY);
      y++
    )
      for (
        let x = Math.floor(left / grid.edgeX);
        x < Math.ceil(right / grid.edgeX);
        x++
      ) {
        signal.throwIfAborted();
        const item = grid.index.cells[y * grid.cols + x];
        if (!item) throw Error("Missing AVIF grid cell");
        const decoded = await this.cell(page, grid, item, signal),
          bitmap = decoded.bitmap;
        signal.throwIfAborted();
        const lease = this.decodeCanvases.acquire({
          width: bitmap.width as DevicePixels,
          height: bitmap.height as DevicePixels,
        });
        try {
          lease.context.drawImage(bitmap, 0, 0);
          const clippedLeft = Math.max(left, x * grid.edgeX),
            clippedTop = Math.max(top, y * grid.edgeY),
            clippedRight = Math.min(right, x * grid.edgeX + bitmap.width),
            clippedBottom = Math.min(bottom, y * grid.edgeY + bitmap.height);
          const crop = lease.context.getImageData(
            clippedLeft - x * grid.edgeX,
            clippedTop - y * grid.edgeY,
            clippedRight - clippedLeft,
            clippedBottom - clippedTop
          );
          for (let row = 0; row < crop.height; row++)
            output.set(
              crop.data.subarray(
                row * crop.width * 4,
                (row + 1) * crop.width * 4
              ),
              ((clippedTop - top + row) * width + clippedLeft - left) * 4
            );
        } finally {
          lease.release();
          if (!decoded.retained) bitmap.close();
        }
      }
    signal.throwIfAborted();
    return output;
  }
}
