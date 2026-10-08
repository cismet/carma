import type { ImageLevel, ImageSize } from "../core/image-level-plan";

export type ImagePyramid = Readonly<{
  native: ImageSize;
  levels: readonly ImageLevel[];
}>;
export type ImageTileRef = Readonly<{
  level: number;
  col: number;
  row: number;
}>;

/** Compressed tile access for one image; decoded pixels belong to the caller. */
export interface ImageTileSource {
  readonly kind: "avif" | "jpeg";
  readonly url: string;
  open(signal: AbortSignal): Promise<ImagePyramid>;
  /** Compressed bytes are in RAM; decoding needs no request. */
  hasBytes(tile: ImageTileRef): boolean;
  /** Make the compressed bytes local with as few requests as possible. */
  fetch(
    tiles: readonly ImageTileRef[],
    signal: AbortSignal,
    priority?: "high" | "low"
  ): Promise<void>;
  /** Decode one tile; the bitmap covers at least the tile's valid level pixels. */
  decode(tile: ImageTileRef, signal: AbortSignal): Promise<ImageBitmap>;
  readonly compressedBytes: number;
  readonly requestCount: number;
  /** Cancel in-flight tile downloads; local bytes stay and later fetches start anew. */
  pause(): void;
  dispose(): void;
}
