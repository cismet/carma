import type { ObliqueDownloadWatermark } from "../../core/types";

export type { ObliqueDownloadWatermark } from "../../core/types";

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
