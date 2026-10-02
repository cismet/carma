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
    nativeSize?: { width: number; height: number };
  }
): PreviewThumbnailLease | null => {
  const originalImageUrl = options?.originalImageUrl;
  const width = options?.nativeSize?.width;
  const height = options?.nativeSize?.height;
  const sourceKey = originalImageUrl ?? `${previewPath}/${imageId}`;
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
    if (!lease) prefetchPreviewThumbnail(source);
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
    width,
    height,
  ]);
  return !hasDecodedImage && thumbnail?.sourceKey === sourceKey
    ? thumbnail.lease
    : null;
};
