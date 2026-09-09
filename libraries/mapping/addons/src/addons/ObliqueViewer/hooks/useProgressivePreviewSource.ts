import { useEffect, useRef, useState } from "react";

import { PREVIEW_QUALITY } from "../constants";
import { getPreviewImageUrl } from "../utils/imageUrls";

type ProgressivePreviewOptions = {
  /** the url the preview is meant to end up showing */
  finalPreviewUrl: string | null;
  /** base path the level-6 thumbnail is built from */
  previewPath?: string;
  imageId?: string;
};

/**
 * The preview's source, low quality first: the level-6 thumbnail at once,
 * the final url once the browser has it. Only the string is decided here;
 * the caller gates and fades.
 */
export const useProgressivePreviewSource = ({
  finalPreviewUrl,
  previewPath,
  imageId,
}: ProgressivePreviewOptions): string | null => {
  const initialLowQuality =
    previewPath && imageId
      ? getPreviewImageUrl(previewPath, PREVIEW_QUALITY.LEVEL_6, imageId)
      : finalPreviewUrl;
  const [progressiveSrc, setProgressiveSrc] = useState<string | null>(
    initialLowQuality
  );
  const imageTokenRef = useRef<string | undefined>(imageId);

  useEffect(() => {
    imageTokenRef.current = imageId;
    if (!previewPath || !imageId) {
      setProgressiveSrc(finalPreviewUrl);
      return undefined;
    }
    const lowQuality = getPreviewImageUrl(
      previewPath,
      PREVIEW_QUALITY.LEVEL_6,
      imageId
    );
    setProgressiveSrc(lowQuality);
    if (!finalPreviewUrl || finalPreviewUrl === lowQuality) return undefined;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled && imageTokenRef.current === imageId) {
        setProgressiveSrc(finalPreviewUrl);
      }
    };
    img.src = finalPreviewUrl;
    return () => {
      cancelled = true;
    };
  }, [previewPath, imageId, finalPreviewUrl]);

  return progressiveSrc;
};
