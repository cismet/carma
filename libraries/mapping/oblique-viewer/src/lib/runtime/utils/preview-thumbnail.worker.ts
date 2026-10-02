/// <reference lib="webworker" />
import type { DevicePixels } from "@carma-units";

self.onmessage = async (
  event: MessageEvent<{
    url: string;
    blob?: Blob;
    tiff?: boolean;
    nativeSize?: { width: DevicePixels; height: DevicePixels };
  }>
) => {
  let bitmap: ImageBitmap | null = null;
  try {
    let blob = event.data.blob;
    if (!blob && event.data.tiff) {
      const native = event.data.nativeSize;
      if (!native) throw new Error("TIFF thumbnail requires camera dimensions");
      const { TiffPreviewSource } = await import(
        "../integrations/tiff-preview-source"
      );
      const source = new TiffPreviewSource(event.data.url, 16 * 1024 * 1024);
      const signal = AbortSignal.timeout(9000);
      const longEdge = Math.max(native.width, native.height);
      const { image } = await source.select(
        {
          source: {
            x: 0 as DevicePixels,
            y: 0 as DevicePixels,
            width: native.width,
            height: native.height,
          },
          target: {
            width: Math.max(
              1,
              Math.round((native.width * 512) / longEdge)
            ) as DevicePixels,
            height: Math.max(
              1,
              Math.round((native.height * 512) / longEdge)
            ) as DevicePixels,
          },
        },
        native,
        signal
      );
      const pixels = await source.read(
        image,
        [0, 0, image.getWidth(), image.getHeight()],
        signal
      );
      const canvas = new OffscreenCanvas(image.getWidth(), image.getHeight());
      const context = canvas.getContext("2d");
      if (!context) throw new Error("TIFF thumbnail canvas unavailable");
      context.putImageData(
        new ImageData(pixels, canvas.width, canvas.height),
        0,
        0
      );
      blob = await canvas.convertToBlob({ type: "image/png" });
    }
    if (!blob) {
      const response = await fetch(event.data.url, {
        cache: "force-cache",
        priority: "low",
      } as RequestInit & { priority: "low" });
      if (!response.ok)
        throw new Error(`Thumbnail preview: ${response.status}`);
      if (Number(response.headers.get("content-length")) > 4 * 1024 * 1024)
        throw new Error("Thumbnail exceeds the bounded JPEG size");
      blob = await response.blob();
    }
    if (blob.size > 4 * 1024 * 1024)
      throw new Error("Thumbnail exceeds the bounded JPEG size");
    const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (!event.data.tiff && (signature[0] !== 0xff || signature[1] !== 0xd8))
      throw new Error("Thumbnail endpoint did not return a JPEG");
    // WebGL ignores Texture.flipY for ImageBitmap; decode in the upload orientation.
    bitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
    });
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge > 512) {
      const source = bitmap;
      bitmap = null;
      try {
        bitmap = await createImageBitmap(source, {
          resizeWidth: Math.max(1, Math.round((source.width * 512) / longEdge)),
          resizeHeight: Math.max(
            1,
            Math.round((source.height * 512) / longEdge)
          ),
          resizeQuality: "high",
          premultiplyAlpha: "none",
        });
      } finally {
        source.close();
      }
    }
    if (!bitmap) throw new Error("Thumbnail decode returned no bitmap");
    self.postMessage({ bitmap, blob }, [bitmap]);
    bitmap = null;
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap?.close();
  }
};
