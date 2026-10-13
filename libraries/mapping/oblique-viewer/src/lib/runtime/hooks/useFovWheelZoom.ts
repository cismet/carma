import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { clamp } from "@carma-commons/math";
import {
  degToRad,
  radToDeg,
  type CssPixels,
  type Degrees,
  type DevicePixels,
  type Radians,
  type Ratio,
} from "@carma-units";

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
const MAX_SOURCE_PIXEL_SCALE = 2;
const ZOOM_COMPENSATION_EPSILON = 1e-8;

const readMinimumFovForMapZoom = (
  map: MaplibreMap,
  maximumZoom = map.getMaxZoom()
): Degrees =>
  radToDeg(
    (2 *
      Math.atan(
        Math.tan(degToRad(map.getVerticalFieldOfView() as Degrees) / 2) /
          2 ** (maximumZoom - map.getZoom())
      )) as Radians
  );

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
  const nextFovDeg = Math.max(fovDeg, readMinimumFovForMapZoom(map)) as Degrees;
  const zoom = Math.min(
    map.getMaxZoom(),
    zoomKeepingCameraForFov(
      map.getZoom(),
      map.getVerticalFieldOfView(),
      nextFovDeg
    )
  );
  if (anchor) {
    const scale =
      Math.tan(degToRad(map.getVerticalFieldOfView() as Degrees) / 2) /
      Math.tan(degToRad(nextFovDeg) / 2);
    const { width, height, centerOffset } = map.transform;
    const x = anchor.x - width / 2;
    const y = anchor.y - height / 2;
    map.setPadding(
      paddingForCenterOffset(map, {
        x: (x + (centerOffset.x - x) * scale) as CssPixels,
        y: (y + (centerOffset.y - y) * scale) as CssPixels,
      }),
      { obliqueFov: true }
    );
  }
  setFov(map, nextFovDeg);
  map.jumpTo({ zoom }, { obliqueFov: true });
};

export const useFovWheelZoom = ({
  map,
  enabled,
  minFovDeg,
  maxFovDeg,
  busyRef,
  previewRoot,
  previewSampling,
  onPreviewZoomEnd,
  previewCameraActive = previewRoot !== null,
  anchorAtCursor = true,
}: {
  map: MaplibreMap | null;
  previewRoot: HTMLDivElement | null;
  previewSampling?: { longEdgePixels: DevicePixels; halfFovTan: number };
  onPreviewZoomEnd?: () => void;
  /** Keep the projection and zoom lease until the return flight finishes. */
  previewCameraActive?: boolean;
  /** Anchor browsing and preview zoom at the current wheel pointer. */
  anchorAtCursor?: boolean;
  enabled: boolean;
  minFovDeg: number;
  maxFovDeg: number;
  /** a flight is running; the wheel is ignored meanwhile */
  busyRef: MutableRefObject<boolean>;
}) => {
  const sourceLongEdgePixels = previewSampling?.longEdgePixels;
  const previewHalfFovTan = previewSampling?.halfFovTan;
  const previewMaximumZoomRef = useRef<{
    map: MaplibreMap;
    maximumZoom: number;
  } | null>(null);
  const getBrowsingMaxZoom = useCallback(
    () => previewMaximumZoomRef.current?.maximumZoom ?? map?.getMaxZoom(),
    [map]
  );
  const onPreviewZoomEndRef = useRef(onPreviewZoomEnd);
  onPreviewZoomEndRef.current = onPreviewZoomEnd;
  useEffect(() => {
    if (!map || !previewCameraActive) return undefined;
    const maximumZoom = map.getMaxZoom();
    previewMaximumZoomRef.current = { map, maximumZoom };
    return () => {
      // Widen the projection before restoring the limit, so MapLibre cannot move the camera by clamping zoom.
      if (map.getZoom() > maximumZoom) {
        applyFovKeepingCamera(map, readMinimumFovForMapZoom(map, maximumZoom));
      }
      map.setMaxZoom(maximumZoom);
      previewMaximumZoomRef.current = null;
    };
  }, [map, previewCameraActive]);
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
      let minimumFovDeg = minFovDeg;
      if (
        previewRoot &&
        sourceLongEdgePixels !== undefined &&
        Number.isFinite(sourceLongEdgePixels) &&
        sourceLongEdgePixels > 0 &&
        previewHalfFovTan !== undefined &&
        Number.isFinite(previewHalfFovTan) &&
        previewHalfFovTan > 0 &&
        map.transform.height > 0
      ) {
        const viewportHeight = map.transform.height as CssPixels;
        const pixelRatio = (
          Number.isFinite(window.devicePixelRatio) &&
          window.devicePixelRatio > 0
            ? window.devicePixelRatio
            : 1
        ) as Ratio;
        const physicalViewportHeight = (viewportHeight *
          pixelRatio) as DevicePixels;
        const maximumImageLongEdge = (sourceLongEdgePixels *
          MAX_SOURCE_PIXEL_SCALE) as DevicePixels;
        minimumFovDeg = radToDeg(
          (2 *
            Math.atan(
              (physicalViewportHeight * previewHalfFovTan) /
                maximumImageLongEdge
            )) as Radians
        );
        const requiredMaximumZoom =
          zoomKeepingCameraForFov(
            map.getZoom(),
            map.getVerticalFieldOfView(),
            minimumFovDeg
          ) + ZOOM_COMPENSATION_EPSILON;
        if (
          previewMaximumZoomRef.current?.map === map &&
          requiredMaximumZoom > map.getMaxZoom()
        ) {
          map.setMaxZoom(requiredMaximumZoom);
        }
      }
      const next = clamp(
        event.deltaY > 0 ? base * (1 + delta) : base / (1 + delta),
        Math.max(minimumFovDeg, readMinimumFovForMapZoom(map)),
        maxFovDeg
      );
      if (Math.abs(next - base) < 1e-4) return;
      running?.cancel();
      pendingTarget = next;
      const rect = container.getBoundingClientRect();
      const cursor = {
        x: (event.clientX - rect.left) as CssPixels,
        y: (event.clientY - rect.top) as CssPixels,
      };
      const { width, height } = map.transform;
      const cursorInsideViewport =
        Number.isFinite(cursor.x) &&
        Number.isFinite(cursor.y) &&
        cursor.x >= 0 &&
        cursor.x <= width &&
        cursor.y >= 0 &&
        cursor.y <= height;
      const anchor =
        anchorAtCursor && cursorInsideViewport
          ? cursor
          : previewRoot
          ? { x: (width / 2) as CssPixels, y: (height / 2) as CssPixels }
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
  }, [
    map,
    enabled,
    minFovDeg,
    maxFovDeg,
    busyRef,
    previewRoot,
    anchorAtCursor,
    sourceLongEdgePixels,
    previewHalfFovTan,
  ]);
  return { getBrowsingMaxZoom };
};
