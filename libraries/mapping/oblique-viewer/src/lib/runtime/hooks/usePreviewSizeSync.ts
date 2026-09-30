import { useEffect, type RefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { readCameraToCenterDistancePx } from "../utils/cameraMath";

export const PREVIEW_WIDTH_VAR = "--oblique-preview-width";
export const PREVIEW_HEIGHT_VAR = "--oblique-preview-height";
export const PREVIEW_OFFSET_X_VAR = "--oblique-preview-offset-x";
export const PREVIEW_OFFSET_Y_VAR = "--oblique-preview-offset-y";

/**
 * Keeps the preview the size the camera makes it: the image's long edge is
 * twice the focal length in CSS pixels times the sensor's half-fov tangent,
 * and MapLibre's camera-to-centre distance is that focal length. Written as
 * CSS variables on every rendered frame, so a wheel zoom scales the image
 * and the map together without a React render in between.
 */
export const usePreviewSizeSync = ({
  map,
  rootRef,
  enabled,
  isVertical,
  imageAspectRatio,
  halfFovTan,
}: {
  map: MaplibreMap | null;
  rootRef: RefObject<HTMLElement>;
  enabled: boolean;
  isVertical: boolean;
  imageAspectRatio: number;
  halfFovTan: number;
}): void => {
  useEffect(() => {
    const root = rootRef.current;
    if (!map || !enabled || !root) return undefined;

    let applied: {
      width: number;
      height: number;
      x: number;
      y: number;
    } | null = null;
    const sync = () => {
      const base = 2 * readCameraToCenterDistancePx(map) * halfFovTan;
      if (!(base > 0)) return;
      const width = base * (isVertical ? imageAspectRatio : 1);
      const height = base * (isVertical ? 1 : 1 / imageAspectRatio);
      const { x, y } = map.transform.centerOffset;
      if (
        applied?.width === width &&
        applied.height === height &&
        applied.x === x &&
        applied.y === y
      )
        return;
      applied = { width, height, x, y };
      root.style.setProperty(PREVIEW_WIDTH_VAR, `${width}px`);
      root.style.setProperty(PREVIEW_HEIGHT_VAR, `${height}px`);
      root.style.setProperty(PREVIEW_OFFSET_X_VAR, `${x}px`);
      root.style.setProperty(PREVIEW_OFFSET_Y_VAR, `${y}px`);
    };

    sync();
    map.on("render", sync);
    map.on("resize", sync);
    return () => {
      map.off("render", sync);
      map.off("resize", sync);
      root.style.removeProperty(PREVIEW_WIDTH_VAR);
      root.style.removeProperty(PREVIEW_HEIGHT_VAR);
      root.style.removeProperty(PREVIEW_OFFSET_X_VAR);
      root.style.removeProperty(PREVIEW_OFFSET_Y_VAR);
    };
  }, [map, rootRef, enabled, isVertical, imageAspectRatio, halfFovTan]);
};
