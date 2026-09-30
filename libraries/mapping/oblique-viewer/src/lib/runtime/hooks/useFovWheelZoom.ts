import { clamp } from "@carma-commons/math";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { zoomKeepingCameraForFov, type TweenHandle } from "../utils/cameraMath";
import { paddingForCenterOffset } from "../utils/offCenterCamera";
import { setFov, tweenFov } from "../utils/obliqueCamera";

/**
 * The wheel changes the field of view instead of the zoom while the viewer
 * is on: the camera stays where it is and the picture narrows or widens,
 * which is what keeps a preview aligned with the map under it. Every fov
 * step re-solves the zoom so the camera does not move, and the steps are
 * tweened so a scroll reads as one motion. Attached to the map's wrapper
 * rather than the canvas, so the preview's backdrop gets it as well.
 */

const WHEEL_ZOOM_DELTA = 0.08;
const WHEEL_ANIMATION_MS = 500;
const PIXEL_WHEEL_DELTA_PER_STEP = 100;
const LINE_WHEEL_DELTA_PER_STEP = 3;

/** the zoom delta as a fraction, from whatever unit the wheel reports */
const readWheelZoomDelta = (event: WheelEvent): number => {
  const absoluteDeltaY = Math.abs(event.deltaY);
  if (!Number.isFinite(absoluteDeltaY) || absoluteDeltaY <= 0) return 0;
  const steps =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? absoluteDeltaY / LINE_WHEEL_DELTA_PER_STEP
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? absoluteDeltaY
      : absoluteDeltaY / PIXEL_WHEEL_DELTA_PER_STEP;
  return steps * WHEEL_ZOOM_DELTA;
};

/** fov and zoom moved together so the camera stays put */
export const applyFovKeepingCamera = (
  map: MaplibreMap,
  fovDeg: number,
  anchor?: { x: number; y: number }
): void => {
  const zoom = zoomKeepingCameraForFov(
    map.getZoom(),
    map.getVerticalFieldOfView(),
    fovDeg
  );
  if (anchor) {
    const scale =
      Math.tan((map.getVerticalFieldOfView() * Math.PI) / 360) /
      Math.tan((fovDeg * Math.PI) / 360);
    const { width, height, centerOffset } = map.transform;
    const x = anchor.x - width / 2;
    const y = anchor.y - height / 2;
    map.setPadding(
      paddingForCenterOffset(map, {
        x: x + (centerOffset.x - x) * scale,
        y: y + (centerOffset.y - y) * scale,
      }),
      { obliqueFov: true }
    );
  }
  setFov(map, fovDeg);
  map.jumpTo({ zoom }, { obliqueFov: true });
};

export const useFovWheelZoom = ({
  map,
  enabled,
  minFovDeg,
  maxFovDeg,
  busyRef,
  previewRoot,
  onPreviewZoomEnd,
}: {
  map: MaplibreMap | null;
  previewRoot: HTMLDivElement | null;
  onPreviewZoomEnd?: () => void;
  enabled: boolean;
  minFovDeg: number;
  maxFovDeg: number;
  /** a flight is running; the wheel is ignored meanwhile */
  busyRef: MutableRefObject<boolean>;
}): void => {
  const onPreviewZoomEndRef = useRef(onPreviewZoomEnd);
  onPreviewZoomEndRef.current = onPreviewZoomEnd;
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const container = map.getContainer();
    const host = container.parentElement ?? container;
    let pendingTarget: number | null = null;
    let running: TweenHandle | null = null;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (busyRef.current) return;
      const delta = readWheelZoomDelta(event);
      if (delta <= 0) return;
      const base = pendingTarget ?? map.getVerticalFieldOfView();
      const next = clamp(
        event.deltaY > 0 ? base * (1 + delta) : base / (1 + delta),
        minFovDeg,
        maxFovDeg
      );
      if (Math.abs(next - base) < 1e-4) return;
      running?.cancel();
      pendingTarget = next;
      const rect = container.getBoundingClientRect();
      const anchor = previewRoot
        ? {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }
        : undefined;
      running = tweenFov(
        map,
        next,
        WHEEL_ANIMATION_MS,
        (fov) => {
          if (busyRef.current) {
            running?.cancel();
            running = null;
            pendingTarget = null;
            return;
          }
          applyFovKeepingCamera(map, fov, anchor);
        },
        () => {
          if (pendingTarget === next) pendingTarget = null;
          running = null;
          if (previewRoot) onPreviewZoomEndRef.current?.();
        }
      );
    };

    host.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      host.removeEventListener("wheel", onWheel, { capture: true });
      running?.cancel();
    };
  }, [map, enabled, minFovDeg, maxFovDeg, busyRef, previewRoot]);
};
