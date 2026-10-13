import type { TiffPreviewSource } from "./tiff-preview-source";

/** Load the optional TIFF/WASM codecs only when a TIFF source is requested. */
export const createTiffPreviewSource = async (
  url: string,
  budget?: number,
  priority?: "low" | "high" | "auto"
): Promise<TiffPreviewSource> => {
  const { TiffPreviewSource } = await import("./tiff-preview-source");
  return new TiffPreviewSource(url, budget, priority);
};
