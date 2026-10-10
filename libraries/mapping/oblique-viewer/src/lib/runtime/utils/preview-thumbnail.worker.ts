/// <reference lib="webworker" />
import type { DevicePixels } from "@carma-units";
import { isAvifSourceMissing } from "@carma-commons/image-pyramid/decoders";

self.onmessage = async (
  event: MessageEvent<{
    url: string;
    blob?: Blob;
    nativeAvifFile?: Blob;
    avifPyramidUrl?: string;
    nativeSize?: { width: DevicePixels; height: DevicePixels };
  }>
) => {
  let bitmap: ImageBitmap | null = null;
  let releaseNative: (() => void) | undefined;
  try {
    if (
      !event.data.blob &&
      (!event.data.avifPyramidUrl || !event.data.nativeSize)
    )
      throw Error(
        "Native AVIF thumbnail requires a published pyramid and camera dimensions"
      );
    let blob = event.data.blob;
    if (!blob && event.data.avifPyramidUrl && event.data.nativeSize) {
      const native = event.data.nativeSize,
        signal = AbortSignal.timeout(8000);
      const { AvifPyramidPreviewSource, registerNativeAvifBlob } = await import(
        "@carma-commons/image-pyramid/decoders"
      );
      if (event.data.nativeAvifFile)
        releaseNative = registerNativeAvifBlob(
          event.data.avifPyramidUrl,
          event.data.nativeAvifFile,
          { previewOnly: true }
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
      } finally {
        source.close();
      }
    }
    if (!blob) throw Error("Native AVIF thumbnail is unavailable");
    if (blob.size > 4 * 1024 * 1024)
      throw new Error("Thumbnail exceeds its encoded budget");
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
      missing: isAvifSourceMissing(error),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap?.close();
    releaseNative?.();
  }
};
