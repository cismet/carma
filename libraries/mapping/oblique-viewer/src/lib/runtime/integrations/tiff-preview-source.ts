/// <reference types="vite/client" />
import {
  addDecoder,
  BaseClient,
  BaseResponse,
  fromCustomClient,
  type GeoTIFF,
  type GeoTIFFImage,
  type getDecoder,
} from "geotiff";
import decodeJpeg, { init } from "@jsquash/jpeg/decode.js";
import wasmUrl from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?url";
import type { DevicePixels } from "@carma-units";
import type { NativePreviewWindow } from "../../core/utils/native-preview-window";

type DecoderParameters = Awaited<
  ReturnType<typeof getDecoder>
>["parameters"] & {
  jpegTables?: Uint8Array;
};
const decodedBlocks = new Map<
  string,
  { encoded: Uint8Array; rgb: Uint8Array }
>();
let decodedBytes = 0;
let decodedByteLimit = 64 * 1024 * 1024;
let codecReady: Promise<void> | undefined;

class WasmJpegDecoder {
  constructor(readonly parameters: DecoderParameters) {}

  async decodeBlock(buffer: ArrayBufferLike): Promise<ArrayBufferLike> {
    codecReady ??= init({ locateFile: () => wasmUrl }).catch((error) => {
      codecReady = undefined;
      throw error;
    });
    await codecReady;
    const block = new Uint8Array(buffer),
      tables = this.parameters.jpegTables;
    let encoded = block;
    if (tables?.length) {
      const tableEnd =
        tables.length -
        (tables.at(-2) === 255 && tables.at(-1) === 217 ? 2 : 0);
      const blockStart = block[0] === 255 && block[1] === 216 ? 2 : 0;
      encoded = new Uint8Array(tableEnd + block.length - blockStart);
      encoded.set(tables.subarray(0, tableEnd));
      encoded.set(block.subarray(blockStart), tableEnd);
    }
    let hash = 2166136261;
    for (const byte of encoded) hash = Math.imul(hash ^ byte, 16777619);
    const key = `${encoded.length}/${hash >>> 0}`;
    const cached = decodedBlocks.get(key);
    if (
      cached &&
      cached.encoded.every((byte, index) => byte === encoded[index])
    ) {
      decodedBlocks.delete(key);
      decodedBlocks.set(key, cached);
      return cached.rgb.buffer;
    }
    const image = await decodeJpeg(new Uint8Array(encoded).buffer);
    const rgb = new Uint8Array(image.width * image.height * 3);
    for (let input = 0, output = 0; input < image.data.length; input += 4) {
      rgb[output++] = image.data[input];
      rgb[output++] = image.data[input + 1];
      rgb[output++] = image.data[input + 2];
    }
    const bytes = encoded.byteLength + rgb.byteLength;
    if (bytes <= decodedByteLimit) {
      if (cached) {
        decodedBytes -= cached.encoded.byteLength + cached.rgb.byteLength;
        decodedBlocks.delete(key);
      }
      decodedBlocks.set(key, { encoded: new Uint8Array(encoded), rgb });
      decodedBytes += bytes;
      while (decodedBytes > decodedByteLimit) {
        const oldest = decodedBlocks.keys().next().value!;
        const entry = decodedBlocks.get(oldest)!;
        decodedBytes -= entry.encoded.byteLength + entry.rgb.byteLength;
        decodedBlocks.delete(oldest);
      }
    }
    return rgb.buffer;
  }

  decode(buffer: ArrayBufferLike): Promise<ArrayBufferLike> {
    return this.decodeBlock(buffer);
  }
}

addDecoder(
  7,
  async () => WasmJpegDecoder,
  async (directory) => ({
    tileWidth: Number(
      (await directory.loadValue("TileWidth")) ??
        (await directory.loadValue("ImageWidth"))
    ),
    tileHeight: Number(
      (await directory.loadValue("TileLength")) ??
        (await directory.loadValue("RowsPerStrip")) ??
        (await directory.loadValue("ImageLength"))
    ),
    planarConfiguration: Number(
      (await directory.loadValue("PlanarConfiguration")) ?? 1
    ),
    bitsPerSample: (await directory.loadValue("BitsPerSample")) ?? [8, 8, 8],
    predictor: 1,
    jpegTables: await directory.loadValue("JPEGTables"),
  }),
  false
);

class RangeResponse extends BaseResponse {
  constructor(readonly bytes: ArrayBuffer, readonly headers: Headers) {
    super();
  }
  override get status() {
    return 206;
  }
  override getHeader(name: string) {
    return this.headers.get(name) ?? undefined;
  }
  override async getData() {
    return this.bytes;
  }
}

class RangeClient extends BaseClient {
  private active = 0;
  private waiting = new Set<() => void>();
  private cache =
    typeof caches === "undefined"
      ? Promise.resolve(null)
      : caches.open("carma-oblique-tiff-ranges-v1").catch(() => null);

  constructor(
    url: string,
    readonly signal: AbortSignal,
    readonly store: {
      blocks: Map<string, RangeResponse>;
      bytes: number;
      limit: number;
      version: string | null;
    },
    readonly priority?: "low" | "high" | "auto"
  ) {
    super(url);
  }

  override async request(options: RequestInit = {}): Promise<BaseResponse> {
    const range = /^bytes=(\d+)-(\d+)$/.exec(
      new Headers(options.headers).get("Range") ?? ""
    );
    if (!range) throw new Error("TIFF requires a bounded byte range");
    const begin = Number(range[1]),
      end = Number(range[2]);
    if (
      !Number.isSafeInteger(begin) ||
      !Number.isSafeInteger(end) ||
      begin < 0 ||
      end < begin ||
      end - begin >= 64 * 1024 * 1024
    )
      throw new Error("TIFF byte range exceeds its working budget");
    const signal = options.signal
      ? AbortSignal.any([options.signal, this.signal])
      : this.signal;
    signal.throwIfAborted();
    const parts: ArrayBuffer[] = [];
    let headers: Headers | undefined;
    for (let offset = begin; offset <= end; offset += 1024 * 1024) {
      const response = await this.range(
        offset,
        Math.min(end, offset + 1024 * 1024 - 1),
        signal
      );
      headers = response.headers;
      parts.push(response.bytes);
      if (response.bytes.byteLength < Math.min(end - offset + 1, 1024 * 1024))
        break;
    }
    const bytes = new Uint8Array(
      parts.reduce((size, part) => size + part.byteLength, 0)
    );
    let offset = 0;
    for (const part of parts) {
      bytes.set(new Uint8Array(part), offset);
      offset += part.byteLength;
    }
    headers = new Headers(headers);
    headers.set(
      "Content-Range",
      `bytes ${begin}-${begin + bytes.byteLength - 1}/${
        headers.get("Content-Range")!.split("/")[1]
      }`
    );
    return new RangeResponse(bytes.buffer, headers);
  }

  private async range(
    begin: number,
    end: number,
    signal: AbortSignal
  ): Promise<RangeResponse> {
    const key = `${begin}-${end}`;
    const cached = this.store.blocks.get(key);
    if (cached) {
      signal.throwIfAborted();
      this.store.blocks.delete(key);
      this.store.blocks.set(key, cached);
      return cached;
    }
    if (this.active >= 4) {
      await new Promise<void>((resolve, reject) => {
        const resume = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          this.waiting.delete(resume);
          reject(signal.reason);
        };
        this.waiting.add(resume);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    } else this.active++;
    try {
      signal.throwIfAborted();
      const cacheKey = new URL(this.url);
      cacheKey.searchParams.set("obliqueRange", key);
      if (this.store.version)
        cacheKey.searchParams.set("obliqueVersion", this.store.version);
      const persisted =
        begin !== 0 && this.store.version
          ? await Promise.race([
              this.cache.then((cache) => cache?.match(cacheKey.href)),
              new Promise<undefined>((resolve) => setTimeout(resolve, 100)),
            ]).catch(() => undefined)
          : undefined;
      signal.throwIfAborted();
      const response =
        persisted ??
        (await fetch(this.url, {
          headers: { Range: `bytes=${begin}-${end}` },
          signal,
          priority: this.priority,
        }));
      const contentRange = response.headers.get("Content-Range");
      const actual = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange ?? "");
      const contentLength = Number(response.headers.get("Content-Length"));
      const actualEnd = actual ? Number(actual[2]) : begin + contentLength - 1;
      // Existing CORS settings expose Content-Length but may hide Content-Range.
      const validLength =
        Number.isSafeInteger(contentLength) &&
        contentLength > 0 &&
        contentLength <= end - begin + 1;
      if (
        (!persisted && response.status !== 206) ||
        (contentRange && !actual) ||
        (actual &&
          (Number(actual[1]) !== begin ||
            actualEnd > end ||
            (actual[3] !== "*" && Number(actual[3]) <= actualEnd))) ||
        (!actual && !validLength)
      ) {
        await response.body?.cancel();
        throw new Error("TIFF server must serve bounded HTTP 206 responses");
      }
      const data = await response.arrayBuffer();
      signal.throwIfAborted();
      if (data.byteLength !== actualEnd - begin + 1)
        throw new Error("Incomplete TIFF byte range");
      if (begin === 0)
        this.store.version =
          response.headers.get("ETag") ?? response.headers.get("Last-Modified");
      if (this.store.version)
        cacheKey.searchParams.set("obliqueVersion", this.store.version);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set(
        "Content-Range",
        `bytes ${begin}-${actualEnd}/${actual?.[3] ?? "*"}`
      );
      const result = new RangeResponse(data, responseHeaders);
      const previous = this.store.blocks.get(key);
      if (previous) this.store.bytes -= previous.bytes.byteLength;
      this.store.blocks.set(key, result);
      this.store.bytes += data.byteLength;
      while (this.store.bytes > this.store.limit) {
        const oldest = this.store.blocks.keys().next().value!;
        this.store.bytes -= this.store.blocks.get(oldest)!.bytes.byteLength;
        this.store.blocks.delete(oldest);
      }
      if (!persisted && this.store.version)
        void this.cache
          .then(async (cache) => {
            if (!cache) return;
            await cache.put(
              cacheKey.href,
              new Response(data, { headers: responseHeaders })
            );
            const keys = await cache.keys();
            const sources = [
              ...new Set(
                keys.map((entry) => {
                  const url = new URL(entry.url);
                  url.searchParams.delete("obliqueRange");
                  url.searchParams.delete("obliqueVersion");
                  return url.href;
                })
              ),
            ];
            const retained = new Set(sources.slice(-4));
            const perSource = new Map<string, number>();
            for (const entry of keys.reverse()) {
              const url = new URL(entry.url);
              url.searchParams.delete("obliqueRange");
              url.searchParams.delete("obliqueVersion");
              const count = (perSource.get(url.href) ?? 0) + 1;
              perSource.set(url.href, count);
              if (!retained.has(url.href) || count > 64)
                await cache.delete(entry);
            }
          })
          .catch(() => {});
      return result;
    } finally {
      const next = this.waiting.values().next().value;
      if (next) {
        this.waiting.delete(next);
        next();
      } else this.active--;
    }
  }
}

/** Worker-owned byte transport and image directories; no server-side decoder. */
export class TiffPreviewSource {
  private signal: AbortSignal | null = null;
  private ranges: {
    blocks: Map<string, RangeResponse>;
    bytes: number;
    limit: number;
    version: string | null;
  };
  private file: Promise<GeoTIFF> | null = null;
  private pages = new Map<number, GeoTIFFImage>();

  constructor(
    readonly url: string,
    budget = 64 * 1024 * 1024,
    readonly priority?: "low" | "high" | "auto"
  ) {
    decodedByteLimit = Math.min(64 * 1024 * 1024, (budget * 2) / 3);
    this.ranges = {
      blocks: new Map(),
      bytes: 0,
      limit: Math.min(32 * 1024 * 1024, budget / 3),
      version: null,
    };
  }

  private async page(
    index: number,
    signal: AbortSignal
  ): Promise<GeoTIFFImage> {
    signal.throwIfAborted();
    const cached = this.pages.get(index);
    if (cached) return cached;
    const pending = (this.file ??= fromCustomClient(
      new RangeClient(this.url, signal, this.ranges, this.priority),
      { allowFullFile: false, blockSize: 65536, cacheSize: 32, maxRanges: 0 },
      signal
    ));
    try {
      const file = await pending;
      signal.throwIfAborted();
      const image = await file.getImage(index);
      signal.throwIfAborted();
      const directory = image.fileDirectory;
      const bits = await directory.loadValue("BitsPerSample");
      if (
        (directory.getValue("Orientation") ?? 1) !== 1 ||
        image.getSamplesPerPixel() !== 3 ||
        Number(directory.getValue("Compression")) !== 7 ||
        !(bits && Array.from(bits).every((bit) => bit === 8)) ||
        (directory.getValue("Predictor") ?? 1) !== 1 ||
        (directory.getValue("PlanarConfiguration") ?? 1) !== 1 ||
        ![2, 6].includes(
          Number(directory.getValue("PhotometricInterpretation"))
        )
      )
        throw new Error(
          "TIFF preview requires calibrated top-left 8-bit JPEG RGB imagery"
        );
      this.pages.set(index, image);
      return image;
    } catch (error) {
      if (this.file === pending) this.file = null;
      throw error;
    }
  }

  /** Native page for an explicit full-resolution export, without overview reads. */
  async native(
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal
  ) {
    if (this.signal !== signal) {
      this.signal = signal;
      this.file = null;
      this.pages.clear();
    }
    const native = await this.page(0, signal);
    if (
      native.getWidth() !== nativeSize.width ||
      native.getHeight() !== nativeSize.height
    )
      throw new Error("TIFF dimensions do not match the camera calibration");
    return native;
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
      throw new Error(
        "TIFF preview requires a finite positive initial pixel size"
      );
    const native = await this.native(nativeSize, signal);
    let index = 0,
      image = native;
    const densityX =
      window.target.width /
      window.source.width /
      maxDisplayPixelsPerSourcePixel;
    const densityY =
      window.target.height /
      window.source.height /
      maxDisplayPixelsPerSourcePixel;
    while (index < 32 && image.fileDirectory.nextIFDByteOffset !== 0) {
      const next = await this.page(index + 1, signal);
      if (
        next.getWidth() / nativeSize.width < densityX ||
        next.getHeight() / nativeSize.height < densityY
      )
        break;
      if (
        next.getWidth() >= image.getWidth() ||
        next.getHeight() >= image.getHeight()
      )
        throw new Error("TIFF overview dimensions must decrease");
      image = next;
      index++;
    }
    return {
      image,
      refinements: Array.from(
        { length: index },
        (_, step) => this.pages.get(index - step - 1)!
      ),
    };
  }

  async read(
    image: GeoTIFFImage,
    window: [number, number, number, number],
    signal: AbortSignal
  ): Promise<Uint8ClampedArray> {
    const rgb = await image.readRasters({
      window,
      samples: [0, 1, 2],
      interleave: true,
      signal,
    });
    signal.throwIfAborted();
    const rgba = new Uint8ClampedArray((rgb.length / 3) * 4);
    for (let input = 0, output = 0; input < rgb.length; input += 3) {
      rgba[output++] = rgb[input];
      rgba[output++] = rgb[input + 1];
      rgba[output++] = rgb[input + 2];
      rgba[output++] = 255;
    }
    return rgba;
  }
}
