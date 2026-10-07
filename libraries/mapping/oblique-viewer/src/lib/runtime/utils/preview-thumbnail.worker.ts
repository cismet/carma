/// <reference lib="webworker" />
import type { DevicePixels } from "@carma-units";

self.onmessage = async (
  event: MessageEvent<{
    url: string;
    blob?: Blob;
    tiff?: boolean;
    avifPyramidUrl?: string;
    avifOnly?: boolean;
    nativeSize?: { width: DevicePixels; height: DevicePixels };
  }>
) => {
  let bitmap: ImageBitmap | null = null;
  try {
    if (
      event.data.avifOnly &&
      (!event.data.avifPyramidUrl || !event.data.nativeSize)
    )
      throw Error(
        "AVIF-only thumbnail requires a published pyramid and camera dimensions"
      );
    let blob = event.data.blob;
    if (!blob && event.data.avifPyramidUrl && event.data.nativeSize) {
      const native = event.data.nativeSize,
        signal = AbortSignal.timeout(8000);
      const { AvifPyramidPreviewSource } = await import(
        "../integrations/avif-pyramid-preview-source"
      );
      const source = new AvifPyramidPreviewSource(
        event.data.avifPyramidUrl,
        16 * 1024 * 1024,
        "low"
      );
      try {
        const selected = await source.select(
          {
            source: {
              x: 0 as DevicePixels,
              y: 0 as DevicePixels,
              width: native.width,
              height: native.height,
            },
            target: {
              width: Math.max(1, Math.ceil(native.width / 32)) as DevicePixels,
              height: Math.max(
                1,
                Math.ceil(native.height / 32)
              ) as DevicePixels,
            },
          },
          native,
          signal
        );
        const image = selected.image;
        if (image.getWidth() * image.getHeight() > 2 * 1024 * 1024)
          throw Error("AVIF thumbnail coarse page exceeds budget");
        const pixels = await source.read(
          image,
          [0, 0, image.getWidth(), image.getHeight()],
          signal
        );
        const canvas = new OffscreenCanvas(image.getWidth(), image.getHeight()),
          context = canvas.getContext("2d");
        if (!context) throw Error("AVIF thumbnail canvas unavailable");
        context.putImageData(
          new ImageData(pixels, canvas.width, canvas.height),
          0,
          0
        );
        blob = await canvas.convertToBlob({ type: "image/png" });
      } catch (error) {
        if (event.data.avifOnly) throw error;
        /* Partially published AVIF files retain the original thumbnail fallback. */
      } finally {
        source.close();
      }
    }
    if (event.data.avifOnly && !blob)
      throw Error("AVIF thumbnail is unavailable");
    if (!blob && event.data.tiff) {
      const native = event.data.nativeSize;
      if (!native) throw new Error("TIFF thumbnail requires camera dimensions");
      const { TiffPreviewSource } = await import(
        "../integrations/tiff-preview-source"
      );
      const source = new TiffPreviewSource(event.data.url, 16 * 1024 * 1024);
      const signal = AbortSignal.timeout(9000);
      const { image } = await source.select(
        {
          source: {
            x: 0 as DevicePixels,
            y: 0 as DevicePixels,
            width: native.width,
            height: native.height,
          },
          target: {
            width: Math.max(1, Math.ceil(native.width / 32)) as DevicePixels,
            height: Math.max(1, Math.ceil(native.height / 32)) as DevicePixels,
          },
        },
        native,
        signal
      );
      if (image.getWidth() * image.getHeight() > 2 * 1024 * 1024)
        throw Error("TIFF thumbnail coarse page exceeds budget");
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
    if (
      !event.data.tiff &&
      !event.data.avifPyramidUrl &&
      (signature[0] !== 0xff || signature[1] !== 0xd8)
    )
      throw new Error("Thumbnail endpoint did not return a JPEG");
    // WebGL ignores Texture.flipY for ImageBitmap; decode in the upload orientation.
    bitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
    });
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const maxEdge = event.data.nativeSize
      ? Math.max(
          Math.ceil(event.data.nativeSize.width / 32),
          Math.ceil(event.data.nativeSize.height / 32)
        )
      : 512;
    if (longEdge > maxEdge) {
      const source = bitmap;
      bitmap = null;
      try {
        bitmap = await createImageBitmap(source, {
          resizeWidth: Math.max(
            1,
            Math.round((source.width * maxEdge) / longEdge)
          ),
          resizeHeight: Math.max(
            1,
            Math.round((source.height * maxEdge) / longEdge)
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
      missing:
        (error instanceof TypeError &&
          /^(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(
            error.message
          )) ||
        /(?:refusing (?:404|410) full-file response|metadata unavailable \((?:404|410)\)|Thumbnail preview:\s*(?:404|410))/.test(
          error instanceof Error ? error.message : String(error)
        ),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap?.close();
  }
};
