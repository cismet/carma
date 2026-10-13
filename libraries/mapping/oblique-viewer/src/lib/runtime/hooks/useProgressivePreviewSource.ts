import { useEffect, useRef, useState } from "react";

import {
  PREVIEW_QUALITY,
  type PreviewQualityLevel,
} from "../../core/constants";
import { getPreviewImageUrl, loadPreviewImage } from "../utils/imageUrls";

type ProgressivePreviewOptions = {
  finalPreviewUrl: string | null;
  initialPreviewUrl?: string;
  previewPath?: string;
  imageId?: string;
  onError?: () => void;
};

/** DOM fallback: retain the decoded source and publish each finer JPEG level. */
export const useProgressivePreviewSource = ({
  finalPreviewUrl,
  initialPreviewUrl,
  previewPath,
  imageId,
  onError,
}: ProgressivePreviewOptions): string | null => {
  const initial =
    initialPreviewUrl ??
    (previewPath && imageId
      ? getPreviewImageUrl(previewPath, PREVIEW_QUALITY.LEVEL_6, imageId)
      : finalPreviewUrl);
  const [progressiveSrc, setProgressiveSrc] = useState<string | null>(initial);
  const sourceKeyRef = useRef(previewPath + "/" + imageId);
  const decodedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!previewPath || !imageId) {
      setProgressiveSrc(finalPreviewUrl);
      return undefined;
    }
    const key = previewPath + "/" + imageId;
    if (sourceKeyRef.current !== key) {
      sourceKeyRef.current = key;
      decodedRef.current = null;
      setProgressiveSrc(initial);
    }
    if (!finalPreviewUrl) return undefined;
    const controller = new AbortController();
    const startUrl = decodedRef.current ?? initial;
    const levels = Object.values(PREVIEW_QUALITY);
    const start = levels.find(
      (level) => startUrl === getPreviewImageUrl(previewPath, level, imageId)
    );
    const end = levels.find(
      (level) =>
        finalPreviewUrl === getPreviewImageUrl(previewPath, level, imageId)
    );
    const urls =
      start !== undefined && end !== undefined
        ? Array.from(
            { length: Math.max(0, Number(start) - Number(end) + 1) },
            (_, step) =>
              getPreviewImageUrl(
                previewPath,
                String(Number(start) - step) as PreviewQualityLevel,
                imageId
              )
          )
        : [finalPreviewUrl];
    void (async () => {
      for (const url of urls) {
        if (controller.signal.aborted) return;
        if (decodedRef.current === url) continue;
        try {
          await loadPreviewImage(url, controller.signal);
          if (controller.signal.aborted) return;
          decodedRef.current = url;
          setProgressiveSrc(url);
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      if (!controller.signal.aborted && !decodedRef.current) onError?.();
    })();
    return () => controller.abort();
  }, [previewPath, imageId, finalPreviewUrl, initial, onError]);

  return progressiveSrc;
};
