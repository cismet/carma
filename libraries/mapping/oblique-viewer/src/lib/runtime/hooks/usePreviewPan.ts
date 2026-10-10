import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import type { CssPixels } from "@carma-units";
import {
  clampPreviewPan,
  type PreviewImageGeometry,
} from "../../core/utils/preview-pan-bounds";
import { readCameraToCenterDistancePx } from "../utils/cameraMath";
import { acquirePreviewProjectionWindow } from "../utils/preview-projection-window";

/** Drag the perspective window; optional per-step camera correction keeps the current view anchor. */
export const usePreviewPan = ({
  map,
  root,
  enabled,
  panEnabled = true,
  continueOnImageChange = false,
  imageId,
  imageGeometry,
  busyRef,
  onPanStart,
  onPanStep,
  onPanEnd,
}: {
  map: MaplibreMap | null;
  root: HTMLDivElement | null;
  enabled: boolean;
  /** Keep the preview projection lease while allowing centered-only interaction. */
  panEnabled?: boolean;
  /** Seamless handovers retain the held pointer and rebase it after landing. */
  continueOnImageChange?: boolean;
  imageId: string | null;
  imageGeometry: PreviewImageGeometry | null;
  busyRef: MutableRefObject<boolean>;
  onPanStart?: () => void;
  onPanStep?: () => void;
  onPanEnd: () => void;
}) => {
  const imageGeometryRef = useRef(imageGeometry);
  imageGeometryRef.current = imageGeometry;
  const imageIdRef = useRef(imageId);
  imageIdRef.current = imageId;
  const panImageKey = continueOnImageChange ? Boolean(imageId) : imageId;
  const savedPaddingRef = useRef<PaddingOptions | null>(null);
  const releaseProjectionRef = useRef<(() => void) | null>(null);
  const beginPreview = useCallback(() => {
    if (!map || releaseProjectionRef.current) return;
    savedPaddingRef.current = { ...map.getPadding() };
    releaseProjectionRef.current = acquirePreviewProjectionWindow(map);
  }, [map]);
  const onPanStartRef = useRef(onPanStart);
  onPanStartRef.current = onPanStart;
  const onPanStepRef = useRef(onPanStep);
  onPanStepRef.current = onPanStep;
  const onPanEndRef = useRef(onPanEnd);
  onPanEndRef.current = onPanEnd;
  const resetPan = useCallback(() => {
    const padding = savedPaddingRef.current;
    if (map && padding && !map.transform.isPaddingEqual(padding))
      map.setPadding(padding, { obliqueFov: true });
  }, [map]);

  const getBrowsingPadding = useCallback(
    () => savedPaddingRef.current ?? map?.getPadding(),
    [map]
  );
  useEffect(
    () => () => {
      resetPan();
      releaseProjectionRef.current?.();
      releaseProjectionRef.current = null;
      savedPaddingRef.current = null;
    },
    [map, resetPan]
  );

  useEffect(() => {
    if (!map || !enabled) return undefined;
    beginPreview();
    return () => {
      resetPan();
      releaseProjectionRef.current?.();
      releaseProjectionRef.current = null;
      savedPaddingRef.current = null;
    };
  }, [map, enabled, resetPan, beginPreview]);

  useEffect(() => {
    if (!map || !root || !enabled || !panEnabled) return undefined;
    // Entry may already be off-centre; dragging starts from that projection.
    const readPadding = () => {
      const currentPadding = map.getPadding();
      return {
        left: currentPadding.left ?? 0,
        right: currentPadding.right ?? 0,
        top: currentPadding.top ?? 0,
        bottom: currentPadding.bottom ?? 0,
      };
    };
    let padding = readPadding();
    let baseOffset = { ...map.transform.centerOffset };
    let currentImageId = imageIdRef.current;
    let rebaseAfterFlight = false;
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
      if (continueOnImageChange) {
        currentImageId = imageIdRef.current;
        rebaseAfterFlight = false;
        padding = readPadding();
        baseOffset = { ...map.transform.centerOffset };
      }
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
      if (!pointer || pointer.id !== event.pointerId) return;
      if (busyRef.current) {
        if (continueOnImageChange) {
          event.preventDefault();
          event.stopPropagation();
          pointer.x = event.clientX;
          pointer.y = event.clientY;
          rebaseAfterFlight = true;
        }
        return;
      }
      if (
        continueOnImageChange &&
        (rebaseAfterFlight || currentImageId !== imageIdRef.current)
      ) {
        event.preventDefault();
        event.stopPropagation();
        currentImageId = imageIdRef.current;
        rebaseAfterFlight = false;
        padding = readPadding();
        baseOffset = { ...map.transform.centerOffset };
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        onPanStartRef.current?.();
        return;
      }
      if (
        !pointer.dragged &&
        Math.hypot(
          event.clientX - pointer.startX,
          event.clientY - pointer.startY
        ) < 3
      )
        return;
      if (!pointer.dragged) {
        onPanStartRef.current?.();
        root.setPointerCapture(event.pointerId);
      }
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
        },
        {
          previousOffset: {
            x: centerOffset.x as CssPixels,
            y: centerOffset.y as CssPixels,
          },
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
      onPanStepRef.current?.();
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
    };
  }, [
    map,
    root,
    enabled,
    panEnabled,
    panImageKey,
    continueOnImageChange,
    busyRef,
  ]);
  return { beginPreview, resetPan, getBrowsingPadding };
};
