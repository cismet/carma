import type { DevicePixels } from "@carma-units";
import type { TiffDownloadRequest } from "./tiff-download-types";

const MAX_PIXELS = 256 * 1024 * 1024;
const MAX_EDGE = 32767;
const STRIP_RGBA_BYTES = 16 * 1024 * 1024;
const MAX_WATERMARK_BYTES = 16 * 1024 * 1024;

/** Explicit native export. Preview and hover workers never invoke this path. */
export const createTiffDownloadJpeg = async (
  request: TiffDownloadRequest,
  signal: AbortSignal
): Promise<Blob> => {
  const { width, height } = request.nativeSize;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_EDGE ||
    height > MAX_EDGE ||
    width * height > MAX_PIXELS
  )
    throw new Error("Das Originalbild ist für einen JPG-Export zu groß.");
  const watermark = request.watermark;
  if (
    !watermark?.imageUrl ||
    !["center", "bottom-right"].includes(watermark.position) ||
    !Number.isFinite(watermark.opacity) ||
    watermark.opacity <= 0 ||
    watermark.opacity > 1 ||
    (watermark.widthFraction !== undefined &&
      (!Number.isFinite(watermark.widthFraction) ||
        watermark.widthFraction <= 0 ||
        watermark.widthFraction > 1)) ||
    (watermark.marginPx !== undefined &&
      (!Number.isFinite(watermark.marginPx) || watermark.marginPx < 0))
  )
    throw new Error(
      "Für den JPG-Download fehlt eine gültige Wasserzeichen-Vorlage."
    );

  let canvas: OffscreenCanvas | null = null;
  let artwork: ImageBitmap | null = null;
  try {
    signal.throwIfAborted();
    // Validate the exact artwork before requesting the photograph's native pixels.
    const response = await fetch(watermark.imageUrl, { mode: "cors", signal });
    if (!response.ok)
      throw new Error(
        `Die Wasserzeichen-Vorlage konnte nicht geladen werden (${response.status}).`
      );
    if (Number(response.headers.get("Content-Length")) > MAX_WATERMARK_BYTES) {
      await response.body?.cancel();
      throw new Error("Die Wasserzeichen-Vorlage ist zu groß.");
    }
    const asset = await response.blob();
    if (asset.size > MAX_WATERMARK_BYTES)
      throw new Error("Die Wasserzeichen-Vorlage ist zu groß.");
    artwork = await createImageBitmap(asset);
    signal.throwIfAborted();
    const artworkWidth =
      watermark.widthFraction === undefined
        ? artwork.width
        : width * watermark.widthFraction;
    const artworkHeight = (artworkWidth * artwork.height) / artwork.width;
    const margin = watermark.marginPx ?? 0;
    if (
      !(artworkWidth > 0 && artworkHeight > 0) ||
      artworkWidth + margin * 2 > width ||
      artworkHeight + margin * 2 > height
    )
      throw new Error(
        "Die Wasserzeichen-Vorlage passt nicht in das Originalbild."
      );

    const { TiffPreviewSource } = await import(
      "../integrations/tiff-preview-source"
    );
    signal.throwIfAborted();
    // Reuse verified bounded ranges, JPEG decoder and compressed-byte cache.
    const source = new TiffPreviewSource(request.url);
    const image = await source.native(
      { width: width as DevicePixels, height: height as DevicePixels },
      signal
    );
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Der Browser kann das Originalbild nicht als JPG exportieren."
      );
    // The output canvas is necessarily native-sized; transient RGBA is strip-sized.
    const rows = Math.max(
      1,
      Math.min(256, Math.floor(STRIP_RGBA_BYTES / (width * 4)))
    );
    for (let top = 0; top < height; top += rows) {
      signal.throwIfAborted();
      const bottom = Math.min(height, top + rows);
      const rgba = await source.read(image, [0, top, width, bottom], signal);
      signal.throwIfAborted();
      context.putImageData(new ImageData(rgba, width, bottom - top), 0, top);
    }
    const x =
      watermark.position === "center"
        ? (width - artworkWidth) / 2
        : width - artworkWidth - margin;
    const y =
      watermark.position === "center"
        ? (height - artworkHeight) / 2
        : height - artworkHeight - margin;
    context.globalAlpha = watermark.opacity;
    context.drawImage(artwork, x, y, artworkWidth, artworkHeight);
    context.globalAlpha = 1;
    signal.throwIfAborted();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 1 });
    signal.throwIfAborted();
    if (!blob.size || blob.type !== "image/jpeg")
      throw new Error("Der Browser hat kein gültiges JPG erzeugt.");
    return blob;
  } finally {
    artwork?.close();
    if (canvas) canvas.width = canvas.height = 1;
  }
};
