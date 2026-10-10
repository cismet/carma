import type { AvifItem } from "../core/avif-grid-index";

const SUPPORTED_PROPERTIES = new Set([
  "ispe",
  "pixi",
  "av1C",
  "colr",
  "a1lx",
  "lsel",
]);

/** Only the opaque SDR 4:4:4 recipe verified against the container decoder is eligible. */
export function nativeAvifVideoConfig(
  cell: AvifItem
): VideoDecoderConfig | undefined {
  if (
    cell.ranges.length !== 4 ||
    cell.properties.some((property) => !SUPPORTED_PROPERTIES.has(property.type))
  )
    return undefined;
  const property = (type: string, length: number) => {
    const matches = cell.properties.filter((value) => value.type === type);
    const bytes = matches[0]?.bytes;
    return matches.length === 1 && bytes && bytes.length >= length
      ? new DataView(Uint8Array.from(bytes).buffer)
      : undefined;
  };
  const ispe = property("ispe", 20);
  const av1 = property("av1C", 12);
  const color = property("colr", 19);
  if (!ispe || !av1 || !color || av1.getUint8(8) !== 0x81) return undefined;
  if (color.getUint32(8) !== 0x6e636c78) return undefined; // nclx; ICC stays container-owned.
  const width = ispe.getUint32(12);
  const height = ispe.getUint32(16);
  const profile = av1.getUint8(9) >> 5;
  const level = av1.getUint8(9) & 31;
  const flags = av1.getUint8(10);
  const tier = flags & 128 ? "H" : "M";
  const depth = flags & 64 ? (flags & 32 ? 12 : 10) : 8;
  const monochrome = (flags >> 4) & 1;
  const subsamplingX = (flags >> 3) & 1;
  const subsamplingY = (flags >> 2) & 1;
  const chromaPosition = flags & 3;
  const primaries = color.getUint16(12);
  const transfer = color.getUint16(14);
  const matrix = color.getUint16(16);
  const fullRange = (color.getUint8(18) >> 7) & 1;
  if (
    width === 0 ||
    height === 0 ||
    width % 8 !== 0 ||
    height % 8 !== 0 ||
    profile !== 1 ||
    depth === 12 ||
    monochrome !== 0 ||
    subsamplingX !== 0 ||
    subsamplingY !== 0 ||
    chromaPosition !== 0 ||
    primaries !== 1 ||
    transfer !== 13 ||
    matrix !== 6 ||
    fullRange !== 1
  )
    return undefined;
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return {
    codec: `av01.${profile}.${twoDigits(level)}${tier}.${twoDigits(
      depth
    )}.${monochrome}.${subsamplingX}${subsamplingY}${chromaPosition}.${twoDigits(
      primaries
    )}.${twoDigits(transfer)}.${twoDigits(matrix)}.${fullRange}`,
    codedWidth: width,
    codedHeight: height,
    optimizeForLatency: true,
    hardwareAcceleration: "prefer-software",
    colorSpace: {
      primaries: "bt709",
      transfer: "iec61966-2-1",
      matrix: "smpte170m",
      fullRange: true,
    },
  };
}

/** One serialized native cell. Outputs retain their actual spatial-layer dimensions. */
export class NativeAvifVideoDecoder {
  private decoder?: VideoDecoder;
  private initialization?: Promise<void>;
  private pending?: {
    timestamp: number;
    resolve: (frame: VideoFrame) => void;
    reject: (error: unknown) => void;
  };
  private failure?: unknown;
  private closed = false;
  private generation = 0;

  constructor(private readonly config: VideoDecoderConfig) {}

  private async initialize() {
    const support = await VideoDecoder.isConfigSupported(this.config);
    if (this.closed) throw this.released();
    if (!support.supported)
      throw new Error("Native AV1 video configuration unsupported");
    this.decoder = new VideoDecoder({
      output: (frame) => {
        const pending = this.pending;
        if (this.closed || !pending || pending.timestamp !== frame.timestamp) {
          frame.close();
          return;
        }
        this.pending = undefined;
        pending.resolve(frame);
      },
      error: (error) => {
        this.failure = error;
        this.pending?.reject(error);
        this.pending = undefined;
      },
    });
    // description is deliberately absent: AV1 low-overhead OBUs carry their sequence header.
    this.decoder.configure(this.config);
  }

  async decode(packet: Uint8Array, final: boolean) {
    this.initialization ??= this.initialize();
    await this.initialization;
    if (this.closed) throw this.released();
    if (this.failure) throw this.failure;
    if (this.pending) throw new Error("Concurrent native AV1 cell packet");
    const generation = this.generation++;
    const timestamp = generation + 1;
    const image = await new Promise<VideoFrame>((resolve, reject) => {
      this.pending = { timestamp, resolve, reject };
      try {
        this.decoder!.decode(
          new EncodedVideoChunk({
            type: generation === 0 ? "key" : "delta",
            timestamp,
            data: packet,
          })
        );
      } catch (error) {
        this.pending = undefined;
        reject(error);
      }
    });
    const scale = 2 ** (3 - generation);
    if (
      this.closed ||
      image.displayWidth !== this.config.codedWidth! / scale ||
      image.displayHeight !== this.config.codedHeight! / scale
    ) {
      image.close();
      throw new Error("Unexpected native AV1 spatial-layer output");
    }
    // Every packet has yielded its matching frame; flushing here would require another keyframe.
    return { image, complete: final };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pending?.reject(this.released());
    this.pending = undefined;
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
  }

  private released() {
    return new DOMException("AVIF video decoder released", "AbortError");
  }
}
