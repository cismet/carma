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

/** A speculative transfer allowance shared by a forecast group. */
export type ImagePrefetchBudget = {
  remainingBytes: number;
  group?: ImagePrefetchBudget;
};
export class ImagePrefetchBudgetExceeded extends Error {
  constructor() {
    super("Speculative image byte budget exhausted");
    this.name = "ImagePrefetchBudgetExceeded";
  }
}
/** Reserve before dispatch, including merged range gaps and metadata. */
export const reserveImagePrefetchBytes = (
  budget: ImagePrefetchBudget | undefined,
  bytes: number
) => {
  if (!budget) return;
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !Number.isFinite(budget.remainingBytes) ||
    bytes > budget.remainingBytes ||
    (budget.group &&
      (!Number.isFinite(budget.group.remainingBytes) ||
        bytes > budget.group.remainingBytes))
  )
    throw new ImagePrefetchBudgetExceeded();
  budget.remainingBytes -= bytes;
  if (budget.group) budget.group.remainingBytes -= bytes;
};

/** Compressed tile access for one image; decoded pixels belong to the caller. */
export interface ImageTileSource {
  readonly kind: "avif" | "jpeg";
  readonly url: string;
  /** Pool priority also applies to metadata/header requests. */
  priority?: "high" | "low";
  /** Present only during speculation; foreground promotion removes it. */
  prefetchBudget?: ImagePrefetchBudget;
  open(signal: AbortSignal): Promise<ImagePyramid>;
  /** Compressed bytes are in RAM; decoding needs no request. */
  hasBytes(tile: ImageTileRef): boolean;
  /**
   * Make compressed bytes local. Optional progress fires only when a complete
   * tile and its decode header are local; the promise still owns the full batch.
   * Sources without progress support retain completion-based scheduling.
   */
  fetch(
    tiles: readonly ImageTileRef[],
    signal: AbortSignal,
    priority?: "high" | "low",
    onTileReady?: (tile: ImageTileRef) => void
  ): Promise<void>;
  /** Decode one tile; the bitmap covers at least the tile's valid level pixels. */
  decode(tile: ImageTileRef, signal: AbortSignal): Promise<ImageBitmap>;
  readonly compressedBytes: number;
  readonly requestCount: number;
  /** Cancel in-flight tile downloads; local bytes stay and later fetches start anew. */
  pause(): void;
  dispose(): void;
}
