import { useEffect, useRef, useState } from "react";
import { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import { getPreviewImageUrl } from "../utils/imageHandling"; // reuse existing helper

interface ProgressivePreviewOptions {
  /** Final (regular) preview url the UI currently expects in props (e.g. LEVEL_3) */
  finalPreviewUrl: string | null;
  /** Base previewPath used to construct lower quality (LEVEL_6) source */
  previewPath?: string;
  /** Image identifier */
  imageId?: string;
  /** When true the hook resets and restarts progressive loading */
  resetKey?: string | number;
}

/**
 * Returns a progressively loading preview source starting with LEVEL_6 (fast small) and
 * upgrading to provided finalPreviewUrl once that has loaded. Only concerns itself with
 * source string selection; callers manage buffering/fade logic.
 */
export const useProgressivePreviewSource = ({
  finalPreviewUrl,
  previewPath,
  imageId,
  resetKey,
}: ProgressivePreviewOptions) => {
  const initialLowQuality =
    previewPath && imageId
      ? getPreviewImageUrl(
          previewPath,
          OBLIQUE_PREVIEW_QUALITY.LEVEL_6,
          imageId
        )
      : finalPreviewUrl ?? null;
  const [progressiveSrc, setProgressiveSrc] = useState<string | null>(
    initialLowQuality
  );
  const lowQualityUrlRef = useRef<string | null>(null);
  const upgradedRef = useRef(false);
  const imageTokenRef = useRef<string | undefined>(imageId);

  // Initialize low quality (LEVEL_6) url if possible
  useEffect(() => {
    imageTokenRef.current = imageId;
    if (!previewPath || !imageId) {
      lowQualityUrlRef.current = null;
      setProgressiveSrc(finalPreviewUrl ?? null);
      return;
    }
    const lq = getPreviewImageUrl(
      previewPath,
      OBLIQUE_PREVIEW_QUALITY.LEVEL_6,
      imageId
    );
    lowQualityUrlRef.current = lq;
    upgradedRef.current = false;
    setProgressiveSrc(lq);
    if (finalPreviewUrl && finalPreviewUrl !== lq) {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (!upgradedRef.current && imageTokenRef.current === imageId) {
          upgradedRef.current = true;
          setProgressiveSrc(finalPreviewUrl);
        }
      };
      img.src = finalPreviewUrl;
    }
  }, [previewPath, imageId, finalPreviewUrl, resetKey]);

  return progressiveSrc;
};
