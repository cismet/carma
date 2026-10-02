/** Exact watermark artwork and placement, supplied by the imagery publisher. */
export type ObliqueDownloadWatermark = Readonly<{
  imageUrl: string;
  position: "center" | "bottom-right";
  opacity: number;
  /** Width relative to the native photograph; omitted preserves artwork pixels. */
  widthFraction?: number;
  marginPx?: number;
}>;

export type TiffDownloadRequest = Readonly<{
  url: string;
  nativeSize: { width: number; height: number };
  watermark: ObliqueDownloadWatermark;
}>;

export type TiffDownloadResponse =
  | { blob: Blob; error?: never }
  | { error: string; blob?: never };
