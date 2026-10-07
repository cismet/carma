import {
  PREVIEW_IMAGE_EXTENSION,
  type PreviewQualityLevel,
} from "../../core/constants";
import { downloadTiffJpeg } from "./tiff-download";
import type { ObliqueDownloadWatermark } from "./tiff-download-types";

export type { ObliqueDownloadWatermark } from "./tiff-download-types";
export type ObliqueDownloadOptions = Readonly<{
  tiff?: boolean;
  avif?: boolean;
  nativeSize?: { width: number; height: number };
  watermark?: ObliqueDownloadWatermark;
  signal?: AbortSignal;
}>;

export const getPreviewImageUrl = (
  previewPath: string,
  level: PreviewQualityLevel,
  imageId: string
): string =>
  `${previewPath.replace(/\/$/, "")}/${level}/${encodeURIComponent(
    imageId
  )}.${PREVIEW_IMAGE_EXTENSION}`;

export const getImageUrls = (
  id: string | undefined,
  path: string | undefined,
  level: PreviewQualityLevel,
  downloadLevel?: PreviewQualityLevel,
  options?: {
    downloadPath?: string;
    originalImageUrlTemplate?: string;
    originalImageUrl?: string;
    avifOnly?: boolean;
    avifPyramidTemplate?: string;
    avifPyramidUrl?: string;
  }
): { previewUrl: string | null; downloadUrl: string | null } => {
  if (!id || !path) {
    return { previewUrl: null, downloadUrl: null };
  }
  return {
    previewUrl: options?.avifOnly ? null : getPreviewImageUrl(path, level, id),
    downloadUrl: options?.avifOnly
      ? options.avifPyramidUrl ??
        options.avifPyramidTemplate?.replace(
          /\{imageId\}/g,
          encodeURIComponent(id)
        ) ??
        null
      : options?.originalImageUrl ??
        (options?.originalImageUrlTemplate
          ? options.originalImageUrlTemplate.replace(
              /\{imageId\}/g,
              encodeURIComponent(id)
            )
          : options?.downloadPath
          ? `${options.downloadPath.replace(/\/$/, "")}/${encodeURIComponent(
              id
            )}.${PREVIEW_IMAGE_EXTENSION}`
          : getPreviewImageUrl(path, downloadLevel ?? level, id)),
  };
};

export const downloadAsBlobAsync = async (
  downloadUrl: string,
  options?: ObliqueDownloadOptions
): Promise<void> => {
  const tiff = options?.tiff;
  if (options?.avif && !options.nativeSize)
    throw new Error("Für den JPG-Download fehlen die AVIF-Bildmaße.");
  if (tiff && !options.nativeSize)
    throw new Error("Für den JPG-Download fehlen die Originalbildmaße.");
  if (tiff && !options.watermark)
    throw new Error("Für den JPG-Download fehlt die Wasserzeichen-Vorlage.");
  const blob = options?.avif
    ? await downloadTiffJpeg(
        { format: "avif", url: downloadUrl, nativeSize: options.nativeSize! },
        options.signal
      )
    : tiff
    ? await downloadTiffJpeg(
        {
          url: downloadUrl,
          nativeSize: options!.nativeSize!,
          watermark: options!.watermark!,
        },
        options?.signal
      )
    : await (async () => {
        const response = await fetch(downloadUrl, {
          mode: "cors",
          signal: options?.signal,
        });
        if (!response.ok)
          throw new Error(
            `Das Bild konnte nicht geladen werden (${response.status}).`
          );
        return response.blob();
      })();
  options?.signal?.throwIfAborted();
  const blobUrl = window.URL.createObjectURL(blob);
  try {
    const filename =
      new URL(downloadUrl, window.location.href).pathname.split("/").pop() ||
      `oblique-image-${Date.now()}.jpg`;
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = options?.avif
      ? filename.replace(/\.avif$/i, ".jpg")
      : tiff
      ? filename.replace(/\.tiff?$/i, ".jpg")
      : filename;
    link.click();
  } finally {
    window.URL.revokeObjectURL(blobUrl);
  }
};

/** Confirm that the browser can decode the requested image before aligning a preview. */
export const loadPreviewImage = (
  url: string,
  signal?: AbortSignal
): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    let retried = false;
    let settled = false;
    const abort = () => {
      finish(
        signal?.reason ?? new DOMException("Preview cancelled", "AbortError")
      );
      image.src = "";
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    const timeout = window.setTimeout(
      () =>
        finish(
          new Error("Das Vorschaubild konnte nicht rechtzeitig geladen werden.")
        ),
      20000
    );
    image.onload = () => finish();
    image.onerror = () => {
      // Older responses cached without Vary: Origin cannot be uploaded to WebGL.
      if (!retried) {
        retried = true;
        const fresh = new URL(url, window.location.href);
        fresh.searchParams.set("obliqueTexture", "1");
        image.src = fresh.href;
        return;
      }
      finish(
        new Error(
          "Das Vorschaubild ist noch nicht verfügbar oder konnte nicht geladen werden."
        )
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else image.src = url;
  });
