import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap, MercatorCoordinate } from "maplibre-gl";
import type { CssPixelPosition, CssPixels } from "@carma-units";

import { QUERY_CURSOR_DEFAULTS } from "../../core/utils/query-cursor";
import {
  isQuerySurfaceTarget,
  mountQueryCursorStyle,
} from "../utils/query-cursor-css";
import { createQueryCursorThree } from "../utils/query-cursor-three";

/**
 * The object query cursor: the CSS crosshair plus the three.js surface ring,
 * over the map canvas and the photo preview. Pointer moves are coalesced to
 * one surface sample per animation frame; nothing here re-renders React.
 */
export const useQueryCursor = ({
  map,
  active,
  readViewAnchor,
  onEscape,
}: {
  map: MaplibreMap | null;
  active: boolean;
  readViewAnchor: (point: CssPixelPosition) => MercatorCoordinate | undefined;
  onEscape?: () => void;
}) => {
  const readAnchorRef = useRef(readViewAnchor);
  readAnchorRef.current = readViewAnchor;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!map || !active) return undefined;
    const container = map.getContainer();
    // The photo preview mounts beside the map container (see ObliqueOverlay).
    const host = container.parentElement ?? container;
    const canvas = map.getCanvas();
    const unmountStyle = mountQueryCursorStyle(host);
    const cursor = createQueryCursorThree(map);
    let pointer: CssPixelPosition | null = null;
    let pointerFrame: number | null = null;
    let normalSampledAt = Number.NEGATIVE_INFINITY;
    const offset = QUERY_CURSOR_DEFAULTS.normalSampleOffset;

    const sample = () => {
      pointerFrame = null;
      const at = pointer;
      if (!at) return;
      const read = readAnchorRef.current;
      const center = read(at);
      if (!center) {
        cursor.setSample(null);
        return;
      }
      const now = performance.now();
      const resampleNormal =
        now - normalSampledAt >= QUERY_CURSOR_DEFAULTS.normalRefreshInterval;
      if (resampleNormal) normalSampledAt = now;
      const shifted = (dx: number, dy: number) =>
        read({
          x: (at.x + dx) as CssPixels,
          y: (at.y + dy) as CssPixels,
        });
      cursor.setSample({
        center,
        neighbours: resampleNormal
          ? {
              right: shifted(offset, 0),
              left: shifted(-offset, 0),
              up: shifted(0, -offset),
              down: shifted(0, offset),
            }
          : null,
      });
    };
    const schedule = () => {
      if (pointerFrame === null)
        pointerFrame = window.requestAnimationFrame(sample);
    };
    const hide = () => {
      pointer = null;
      if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame);
      pointerFrame = null;
      normalSampledAt = Number.NEGATIVE_INFINITY;
      cursor.setSample(null);
    };
    const onMove = (event: PointerEvent) => {
      if (!isQuerySurfaceTarget(event.target, canvas)) {
        if (pointer) hide();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      pointer = {
        x: (event.clientX - bounds.left) as CssPixels,
        y: (event.clientY - bounds.top) as CssPixels,
      };
      schedule();
    };
    // Camera moves change the surface under a resting pointer.
    const onCameraMove = () => {
      if (pointer) schedule();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      hide();
      escapeRef.current?.();
    };
    host.addEventListener("pointermove", onMove, {
      capture: true,
      passive: true,
    });
    host.addEventListener("pointerleave", hide);
    map.on("move", onCameraMove);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      host.removeEventListener("pointermove", onMove, { capture: true });
      host.removeEventListener("pointerleave", hide);
      map.off("move", onCameraMove);
      window.removeEventListener("keydown", onKeyDown, true);
      if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame);
      cursor.dispose();
      unmountStyle();
    };
  }, [map, active]);
};

/**
 * Tracks a view-mode request from the click until its data wait settles, so
 * the query cursor can follow the request instead of the loaded mode.
 */
export const useViewModeRequest = <Mode extends string>() => {
  const [pending, setPending] = useState<{
    mode: Mode;
    token: number;
  } | null>(null);
  const tokenRef = useRef(0);
  const track = useCallback((mode: Mode, settled: Promise<unknown>) => {
    const token = ++tokenRef.current;
    setPending({ mode, token });
    const clear = () =>
      setPending((current) => (current?.token === token ? null : current));
    settled.then(clear, clear);
  }, []);
  const cancel = useCallback(() => {
    tokenRef.current++;
    setPending(null);
  }, []);
  return { pendingMode: pending?.mode ?? null, track, cancel };
};
