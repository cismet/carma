/** Exact watermark artwork and placement, supplied by the imagery publisher. */
export type ObliqueDownloadWatermark = Readonly<{
  imageUrl: string;
  position: "center" | "top-left" | "bottom-right";
  /** Match the publisher's ImageMagick composition; omitted uses ordinary alpha blending. */
  blend?: "source-over" | "screen";
  opacity: number;
  /** Width relative to the native photograph; omitted preserves artwork pixels. */
  widthFraction?: number;
  marginPx?: number;
}>;

export type TiffDownloadRequest =
  | Readonly<{
      format?: "tiff";
      url: string;
      nativeSize: { width: number; height: number };
      watermark: ObliqueDownloadWatermark;
    }>
  | Readonly<{
      format: "avif";
      url: string;
      nativeSize: { width: number; height: number };
    }>;

export type TiffDownloadResponse =
  | { blob: Blob; error?: never }
  | { error: string; blob?: never };
