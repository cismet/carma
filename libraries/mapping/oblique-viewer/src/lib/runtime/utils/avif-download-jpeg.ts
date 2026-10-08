import type { DevicePixels } from "@carma-units";
import { AvifPyramidPreviewSource } from "@carma-commons/image-streaming";
import type { TiffDownloadRequest } from "./tiff-download-types";

/** Export the published L1 pixels, including their baked publisher attribution. */
export const createAvifDownloadJpeg = async (
  request: Extract<TiffDownloadRequest, { format: "avif" }>,
  signal: AbortSignal
): Promise<Blob> => {
  const { width, height } = request.nativeSize;
  if (
    ![width, height].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= 32767
    ) ||
    width * height > 256 * 1024 * 1024
  )
    throw new Error("Das Bild ist für einen JPG-Export zu groß.");
  const source = new AvifPyramidPreviewSource(request.url);
  let canvas: OffscreenCanvas | undefined;
  try {
    const size = {
      width: width as DevicePixels,
      height: height as DevicePixels,
    };
    const { image } = await source.select(
      {
        source: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...size },
        target: size,
      },
      size,
      signal
    );
    if (image.level !== 1)
      throw new Error(
        "Für den JPG-Export fehlt die öffentliche AVIF-L1-Stufe."
      );
    const w = image.getWidth(),
      h = image.getHeight();
    canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Der Browser kann das AVIF-Bild nicht als JPG exportieren."
      );
    // A row strip stays below the reader's four-million-pixel ROI budget.
    const rows = Math.max(1, Math.min(256, Math.floor((4 * 1024 * 1024) / w)));
    for (let y = 0; y < h; y += rows) {
      signal.throwIfAborted();
      const bottom = Math.min(h, y + rows);
      const rgba = await source.read(image, [0, y, w, bottom], signal);
      context.putImageData(new ImageData(rgba, w, bottom - y), 0, y);
    }
    signal.throwIfAborted();
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.95,
    });
    signal.throwIfAborted();
    if (!blob.size || blob.type !== "image/jpeg")
      throw new Error("Der Browser hat kein gültiges JPG erzeugt.");
    return blob;
  } finally {
    source.close();
    if (canvas) canvas.width = canvas.height = 1;
  }
};
