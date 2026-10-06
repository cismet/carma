import { useEffect, useState } from "react";
import {
  acquirePreviewThumbnail,
  prefetchPreviewThumbnail,
  subscribePreviewThumbnail,
  type PreviewThumbnailLease,
} from "../utils/preview-thumbnail-cache";

/** Lease a warm worker-decoded image while the progressive source is still loading. */
export const usePrefetchedPreviewThumbnail = (
  previewPath: string,
  imageId: string,
  hasDecodedImage: boolean,
  options?: {
    originalImageUrl?: string;
    avifPyramidUrl?: string;
    enqueue?: boolean;
    nativeSize?: { width: number; height: number };
  }
): PreviewThumbnailLease | null => {
  const originalImageUrl = options?.originalImageUrl;
  const avifPyramidUrl = options?.avifPyramidUrl;
  const enqueue = options?.enqueue;
  const width = options?.nativeSize?.width;
  const height = options?.nativeSize?.height;
  const sourceKey =
    avifPyramidUrl ?? originalImageUrl ?? `${previewPath}/${imageId}`;
  const [thumbnail, setThumbnail] = useState<{
    sourceKey: string;
    lease: PreviewThumbnailLease;
  } | null>(null);
  useEffect(() => {
    if (hasDecodedImage) {
      setThumbnail(null);
      return undefined;
    }
    const source = {
      previewPath,
      imageId,
      originalImageUrl,
      avifPyramidUrl,
      nativeSize: width && height ? { width, height } : undefined,
    };
    let lease: PreviewThumbnailLease | null = null;
    const receive = () => {
      if (lease) return;
      lease = acquirePreviewThumbnail(source);
      if (lease) setThumbnail({ sourceKey, lease });
    };
    const unsubscribe = subscribePreviewThumbnail(source, receive);
    receive();
    if (!lease) prefetchPreviewThumbnail(source, { enqueue });
    return () => {
      unsubscribe();
      lease?.release();
    };
  }, [
    previewPath,
    imageId,
    sourceKey,
    hasDecodedImage,
    originalImageUrl,
    avifPyramidUrl,
    enqueue,
    width,
    height,
  ]);
  return !hasDecodedImage && thumbnail?.sourceKey === sourceKey
    ? thumbnail.lease
    : null;
};
