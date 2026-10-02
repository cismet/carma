import {
  PREVIEW_IMAGE_EXTENSION,
  type PreviewQualityLevel,
} from "../../core/constants";

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
  }
): { previewUrl: string | null; downloadUrl: string | null } => {
  if (!id || !path) {
    return { previewUrl: null, downloadUrl: null };
  }
  return {
    previewUrl: getPreviewImageUrl(path, level, id),
    downloadUrl:
      options?.originalImageUrl ??
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
  downloadUrl: string
): Promise<void> => {
  try {
    const response = await fetch(downloadUrl, { mode: "cors" });
    if (!response.ok) throw new Error("Network response was not ok");
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const filename =
      downloadUrl.split("/").pop() || `oblique-image-${Date.now()}.jpg`;
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.warn("[OBLIQUE] download failed", error);
  }
};

/** Confirm that the browser can decode the requested image before aligning a preview. */
export const loadPreviewImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    let retried = false;
    const finish = (error?: Error) => {
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
    image.src = url;
  });
