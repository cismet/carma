import { useEffect, useState, type RefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { PreviewQualityLevel } from "../../core/constants";
import { getPreviewImageUrl } from "../utils/imageUrls";
import { PREVIEW_HEIGHT_VAR, PREVIEW_WIDTH_VAR } from "./usePreviewSizeSync";

type LoadedImage = { url: string; width: number; height: number };

/** Upgrade decoded previews only when the displayed image needs more pixels. */
export const usePreviewResolution = ({
  map,
  rootRef,
  previewPath,
  imageId,
  qualityLevel,
  loadedImage,
  minimumLevel = "0",
}: {
  map: MaplibreMap;
  rootRef: RefObject<HTMLElement>;
  previewPath: string;
  imageId: string;
  qualityLevel: PreviewQualityLevel;
  loadedImage: LoadedImage | null;
  minimumLevel?: PreviewQualityLevel;
}): PreviewQualityLevel => {
  const [requested, setRequested] = useState(qualityLevel);
  const level = Math.max(
    Number(minimumLevel),
    Math.min(Number(requested), Number(qualityLevel))
  );
  const result = String(level) as PreviewQualityLevel;
  useEffect(() => {
    const root = rootRef.current;
    if (
      !root ||
      level <= Number(minimumLevel) ||
      !loadedImage ||
      loadedImage.url !== getPreviewImageUrl(previewPath, result, imageId)
    )
      return undefined;
    let timer: number | undefined;
    let previousEdge: number | undefined;
    const check = () => {
      const edge =
        Math.max(
          parseFloat(root.style.getPropertyValue(PREVIEW_WIDTH_VAR)),
          parseFloat(root.style.getPropertyValue(PREVIEW_HEIGHT_VAR))
        ) * (window.devicePixelRatio || 1);
      if (edge === previousEdge) return;
      previousEdge = edge;
      window.clearTimeout(timer);
      if (edge > Math.max(loadedImage.width, loadedImage.height)) {
        timer = window.setTimeout(() => {
          setRequested(String(level - 1) as PreviewQualityLevel);
        }, 200);
      }
    };
    check();
    map.on("render", check);
    map.on("resize", check);
    return () => {
      window.clearTimeout(timer);
      map.off("render", check);
      map.off("resize", check);
    };
  }, [
    map,
    rootRef,
    previewPath,
    imageId,
    result,
    level,
    loadedImage,
    minimumLevel,
  ]);
  return result;
};
