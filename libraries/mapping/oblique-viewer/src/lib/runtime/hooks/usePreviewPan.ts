import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import type { CssPixels } from "@carma-units";
import {
  clampPreviewPan,
  type PreviewImageGeometry,
} from "../../core/utils/preview-pan-bounds";
import { readCameraToCenterDistancePx } from "../utils/cameraMath";
import { acquirePreviewProjectionWindow } from "../utils/preview-projection-window";

/** Drag the perspective window; the image camera never moves or changes orientation. */
export const usePreviewPan = ({
  map,
  root,
  enabled,
  imageId,
  imageGeometry,
  busyRef,
  onPanEnd,
}: {
  map: MaplibreMap | null;
  root: HTMLDivElement | null;
  enabled: boolean;
  imageId: string | null;
  imageGeometry: PreviewImageGeometry | null;
  busyRef: MutableRefObject<boolean>;
  onPanEnd: () => void;
}) => {
  const imageGeometryRef = useRef(imageGeometry);
  imageGeometryRef.current = imageGeometry;
  const savedPaddingRef = useRef<PaddingOptions | null>(null);
  const onPanEndRef = useRef(onPanEnd);
  onPanEndRef.current = onPanEnd;
  const resetPan = useCallback(() => {
    const padding = savedPaddingRef.current;
    if (map && padding && !map.transform.isPaddingEqual(padding))
      map.setPadding(padding, { obliqueFov: true });
  }, [map]);

  useEffect(() => {
    if (!map || !root || !enabled) return undefined;
    const releaseProjection = acquirePreviewProjectionWindow(map);
    const currentPadding = map.getPadding();
    const padding = {
      left: currentPadding.left ?? 0,
      right: currentPadding.right ?? 0,
      top: currentPadding.top ?? 0,
      bottom: currentPadding.bottom ?? 0,
    };
    savedPaddingRef.current = padding;
    const baseOffset = { ...map.transform.centerOffset };
    let pointer: {
      id: number;
      x: number;
      y: number;
      startX: number;
      startY: number;
      dragged: boolean;
    } | null = null;
    let suppressClick = false;
    let clickTimer: number | undefined;

    const down = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        busyRef.current ||
        pointer
      )
        return;
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        dragged: false,
      };
    };
    const move = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId || busyRef.current) return;
      if (
        !pointer.dragged &&
        Math.hypot(
          event.clientX - pointer.startX,
          event.clientY - pointer.startY
        ) < 3
      )
        return;
      if (!pointer.dragged) root.setPointerCapture(event.pointerId);
      pointer.dragged = true;
      event.preventDefault();
      event.stopPropagation();
      root.style.setProperty("--oblique-preview-cursor", "grabbing");
      const { centerOffset } = map.transform;
      const geometry = imageGeometryRef.current;
      if (!geometry) return;
      const edge = 2 * readCameraToCenterDistancePx(map) * geometry.halfFovTan;
      const aspect = geometry.aspectRatio;
      const { x, y } = clampPreviewPan(
        {
          x: (centerOffset.x + event.clientX - pointer.x) as CssPixels,
          y: (centerOffset.y + event.clientY - pointer.y) as CssPixels,
        },
        {
          viewport: {
            width: map.transform.width as CssPixels,
            height: map.transform.height as CssPixels,
          },
          image: {
            width: (aspect >= 1 ? edge : edge * aspect) as CssPixels,
            height: (aspect >= 1 ? edge / aspect : edge) as CssPixels,
          },
          principal: geometry.principal,
          roll: geometry.roll,
        }
      );
      const dx = x - baseOffset.x;
      const dy = y - baseOffset.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      map.setPadding(
        {
          left: padding.left + Math.max(0, 2 * dx),
          right: padding.right + Math.max(0, -2 * dx),
          top: padding.top + Math.max(0, 2 * dy),
          bottom: padding.bottom + Math.max(0, -2 * dy),
        },
        { obliqueFov: true }
      );
    };
    const end = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dragged = pointer.dragged;
      pointer = null;
      root.style.removeProperty("--oblique-preview-cursor");
      if (root.hasPointerCapture(event.pointerId))
        root.releasePointerCapture(event.pointerId);
      if (dragged) {
        suppressClick = true;
        window.clearTimeout(clickTimer);
        clickTimer = window.setTimeout(() => {
          suppressClick = false;
        }, 0);
        if (!busyRef.current) onPanEndRef.current();
      }
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    root.addEventListener("lostpointercapture", end);
    root.addEventListener("click", click, true);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      root.removeEventListener("lostpointercapture", end);
      root.removeEventListener("click", click, true);
      window.clearTimeout(clickTimer);
      if (pointer && root.hasPointerCapture(pointer.id))
        root.releasePointerCapture(pointer.id);
      pointer = null;
      root.style.removeProperty("--oblique-preview-cursor");
      resetPan();
      releaseProjection();
      savedPaddingRef.current = null;
    };
  }, [map, root, enabled, imageId, busyRef, resetPan]);
  return resetPan;
};
