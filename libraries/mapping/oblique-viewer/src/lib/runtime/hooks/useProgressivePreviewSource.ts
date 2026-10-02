import { useEffect, useRef, useState } from "react";

import { PREVIEW_QUALITY } from "../../core/constants";
import { getPreviewImageUrl, loadPreviewImage } from "../utils/imageUrls";

type ProgressivePreviewOptions = {
  /** the url the preview is meant to end up showing */
  finalPreviewUrl: string | null;
  /** base path the level-6 thumbnail is built from */
  previewPath?: string;
  imageId?: string;
  onError?: () => void;
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
  onError,
}: ProgressivePreviewOptions): string | null => {
  const initialLowQuality =
    previewPath && imageId
      ? getPreviewImageUrl(previewPath, PREVIEW_QUALITY.LEVEL_6, imageId)
      : finalPreviewUrl;
  const [progressiveSrc, setProgressiveSrc] = useState<string | null>(
    initialLowQuality
  );
  const imageTokenRef = useRef<string | undefined>(imageId);
  const sourceKeyRef = useRef(`${previewPath}/${imageId}`);
  const hasFinalRef = useRef(false);

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
    const key = `${previewPath}/${imageId}`;
    if (sourceKeyRef.current !== key) {
      sourceKeyRef.current = key;
      hasFinalRef.current = false;
      setProgressiveSrc(lowQuality);
    }
    if (!finalPreviewUrl || finalPreviewUrl === lowQuality) return undefined;
    let cancelled = false;
    void loadPreviewImage(finalPreviewUrl)
      .then(() => {
        if (!cancelled && imageTokenRef.current === imageId) {
          hasFinalRef.current = true;
          setProgressiveSrc(finalPreviewUrl);
        }
      })
      .catch(() => {
        if (
          !cancelled &&
          imageTokenRef.current === imageId &&
          !hasFinalRef.current
        )
          onError?.();
      });
    return () => {
      cancelled = true;
    };
  }, [previewPath, imageId, finalPreviewUrl, onError]);

  return progressiveSrc;
};
