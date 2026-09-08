import type { DecodedRaster } from "../../core/raster-dem-tile";

export const decodeImage = async (blob: Blob): Promise<DecodedRaster> => {
  const image = await createImageBitmap(blob, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  try {
    const canvas =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(image.width, image.height)
        : Object.assign(document.createElement("canvas"), {
            width: image.width,
            height: image.height,
          });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !("getImageData" in context)) {
      throw new Error("A 2D canvas is required to decode raster DEM tiles");
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    return { width: image.width, height: image.height, pixels };
  } finally {
    image.close();
  }
};
