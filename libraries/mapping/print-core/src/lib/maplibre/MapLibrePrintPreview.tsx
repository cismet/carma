// MapLibre print preview — the engine-coupled analog of the geoportal
// PrintPreview.tsx (Leaflet). It draws the draggable print rectangle on the
// map, overlays the controls on top of it, keeps both in sync as the map
// pans / zooms, and submits the MapFish print job via the core printMap().
//
// The rectangle is a plain DOM box (this overlay div), NOT a WebGL layer — the
// same trick Leaflet uses. While dragging we just slide the div with a CSS
// transform (compositor-only, perfectly smooth) and never touch any map
// geometry; the real WGS84 bounds are recomputed once, on mouse-up. The map
// still owns hit-testing (a pixel test against the rectangle's screen box), so
// pan / zoom / click outside all keep working.
//
// The component is Redux-free and fully controlled (like PrintSettings): the
// consuming app feeds it the print state as props and maps the callbacks onto
// its own store. It MAY import maplibre-gl (types), React and from "../core".

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";

import {
  getPreviewFontSize,
  getPreviewIsSmallMode,
  getPrintLayers,
  printMap,
} from "../core";
import type { Orientation, PrintInputLayer } from "../core";
import { PrintPreviewControls } from "../ui/PrintPreviewControls";
import { showPrintErrorToast } from "../ui/showPrintErrorToast";
import {
  buildRectBounds,
  fitMapToRect,
  getRectCenter3857,
  getRectScreenBox,
  pointInRectBox,
  unprojectScreenBox,
} from "./previewRect";
import type { RectBounds, RectScreenBox } from "./previewRect";

import "./printPreview.css";

export interface MapLibrePrintPreviewProps {
  /** The MapLibre map (e.g. from useLibreContext().map). */
  map: MapLibreMap | null | undefined;
  /** Whether the print preview is active (analog of UIMode === "print"). */
  active: boolean;

  orientation: Orientation;
  /** Scale denominator as string (e.g. "250"). */
  scale: string;
  /** Resolution as string (e.g. "72"). */
  dpi: string;
  /** File name used for the iOS download fallback. */
  name?: string;
  /**
   * Normalized layers to print. Translated to MapFish layers via the core
   * getPrintLayers at print time. The app is responsible for mapping its own
   * layer model onto PrintInputLayer.
   */
  layers?: PrintInputLayer[];

  /**
   * Change this value to (re)seed the rectangle at the current map center —
   * the MapLibre analog of geoportal's redrawPreview toggle.
   */
  redrawTrigger?: unknown;
  /**
   * Keep the current rectangle instead of re-seeding (set after a print, the
   * analog of ifMapPrinted). When false, a redraw seeds a fresh rectangle.
   */
  keepRectangle?: boolean;
  /** A print job is in flight — blocks dragging and disables the print button. */
  loading?: boolean;
  /** Close the preview on a single click on the empty map (default true). */
  closeOnMapClick?: boolean;

  onClose?: () => void;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (message: string) => void;
  /** Fired when a print job starts (mark "printed" so the rect is kept). */
  onPrintStart?: () => void;
  /** Fired by the move / update-scale handle to request a fresh rectangle. */
  onRequestRedraw?: () => void;
}

export const MapLibrePrintPreview = ({
  map,
  active,
  orientation,
  scale,
  dpi,
  name,
  layers,
  redrawTrigger,
  keepRectangle = false,
  loading = false,
  closeOnMapClick = true,
  onClose,
  onLoadingChange,
  onError,
  onPrintStart,
  onRequestRedraw,
}: MapLibrePrintPreviewProps) => {
  const boundsRef = useRef<RectBounds | null>(null);
  const [screenBox, setScreenBox] = useState<RectScreenBox | null>(null);
  const [hideContent, setHideContent] = useState(false);

  // The rectangle div: dragged via a direct CSS transform on this node so the
  // motion never goes through React state (Leaflet-smooth, compositor-only).
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Latest-value refs so the map-level listeners (attached once per active
  // session) always read fresh props without being re-bound on every change.
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const printRef = useRef<() => void>(() => undefined);
  // Current rectangle pixel box, mirrored into a ref for the map hit-tests.
  const screenBoxRef = useRef<RectScreenBox | null>(null);
  screenBoxRef.current = screenBox;

  const recomputeBox = useCallback(() => {
    if (!map || !boundsRef.current) return;
    setScreenBox(getRectScreenBox(map, boundsRef.current));
  }, [map]);

  const startPrint = useCallback(() => {
    const bounds = boundsRef.current;
    if (!map || !bounds) return;
    onPrintStart?.();
    const job = {
      center: getRectCenter3857(bounds),
      scale: Number(scale),
      orientation,
      dpi: Number(dpi),
      layers: getPrintLayers(layers ?? []),
      name,
    };
    void printMap(job, {
      onLoading: onLoadingChange,
      // The print library owns error surfacing: it always shows a toast with a
      // link to the concrete error, then forwards to the consumer's onError
      // (e.g. for an app-level error indicator).
      onError: (errorMessage) => {
        showPrintErrorToast(errorMessage);
        onError?.(errorMessage);
      },
    });
  }, [
    map,
    scale,
    orientation,
    dpi,
    layers,
    name,
    onPrintStart,
    onLoadingChange,
    onError,
  ]);
  printRef.current = startPrint;

  // --- Map-level listeners: bound once per active session ---
  useEffect(() => {
    if (!map || !active) return;

    const canvas = map.getCanvas();
    const detachers: Array<() => void> = [];

    // --- Drag the rectangle (Leaflet-style: CSS transform, commit on release).
    // The rectangle div is pointer-events:none, so mousedown lands on the map
    // canvas; we hit-test the pixel box ourselves and slide the div directly.
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startBox: RectScreenBox | null = null;

    const onMouseDown = (e: MapMouseEvent) => {
      if (loadingRef.current) return;
      const box = screenBoxRef.current;
      if (!box || !pointInRectBox(e.point, box)) return;
      // Stop the map's own drag-pan while grabbing the rectangle.
      e.preventDefault();
      dragging = true;
      startX = e.point.x;
      startY = e.point.y;
      startBox = box;
      map.dragPan.disable();
      canvas.style.cursor = "grabbing";
      // Promote the rectangle to its own compositor layer so the per-frame
      // transform never triggers a repaint of its border / text-shadow.
      if (overlayRef.current) overlayRef.current.style.willChange = "transform";
    };

    const onMouseMove = (e: MapMouseEvent) => {
      if (dragging) {
        if (!startBox || !overlayRef.current) return;
        const dx = e.point.x - startX;
        const dy = e.point.y - startY;
        // Compositor-only translate — no React render, no map work.
        overlayRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
        return;
      }
      // Idle: show a grab cursor while hovering the rectangle.
      const box = screenBoxRef.current;
      canvas.style.cursor =
        box && !loadingRef.current && pointInRectBox(e.point, box)
          ? "grab"
          : "";
    };

    const onMouseUp = (e: MapMouseEvent) => {
      if (!dragging || !startBox) return;
      dragging = false;
      map.dragPan.enable();
      canvas.style.cursor = "";

      const dx = e.point.x - startX;
      const dy = e.point.y - startY;
      const moved: RectScreenBox = {
        top: startBox.top + dy,
        left: startBox.left + dx,
        width: startBox.width,
        height: startBox.height,
      };
      startBox = null;

      // Commit the dropped position atomically (clear transform + set the new
      // top/left in the same frame) so there is no flash, then recover the
      // real WGS84 bounds and re-fit the map to the rectangle.
      const el = overlayRef.current;
      if (el) {
        el.style.transform = "";
        el.style.left = `${moved.left}px`;
        el.style.top = `${moved.top}px`;
        el.style.willChange = "";
      }
      if (dx === 0 && dy === 0) return;
      const bounds = unprojectScreenBox(map, moved);
      boundsRef.current = bounds;
      setScreenBox(moved);
      // Animated re-fit: the map eases to re-center the rectangle (the 'move'
      // events reposition the overlay each frame), so it glides instead of
      // snapping — matching the geoportal release animation.
      fitMapToRect(map, bounds, true);
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    detachers.push(() => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      if (dragging) {
        map.dragPan.enable();
        canvas.style.cursor = "";
      }
    });

    // --- Double-click the rectangle to print.
    const onDblClick = (e: MapMouseEvent) => {
      const box = screenBoxRef.current;
      if (box && pointInRectBox(e.point, box)) {
        e.preventDefault(); // stop the map's double-click zoom
        printRef.current();
      }
    };
    map.on("dblclick", onDblClick);
    detachers.push(() => map.off("dblclick", onDblClick));

    // --- Keep the overlay glued to the rectangle while the map pans / zooms.
    const onMoveStart = () => setHideContent(true);
    const onMove = () => recomputeBox();
    const onMoveEnd = () => {
      recomputeBox();
      setHideContent(false);
    };
    map.on("movestart", onMoveStart);
    map.on("move", onMove);
    map.on("moveend", onMoveEnd);
    map.on("zoomstart", onMoveStart);
    map.on("zoom", onMove);
    map.on("zoomend", onMoveEnd);
    detachers.push(() => {
      map.off("movestart", onMoveStart);
      map.off("move", onMove);
      map.off("moveend", onMoveEnd);
      map.off("zoomstart", onMoveStart);
      map.off("zoom", onMove);
      map.off("zoomend", onMoveEnd);
    });

    // --- Single click outside the rectangle closes the preview.
    if (closeOnMapClick) {
      const onMapClick = (e: MapMouseEvent) => {
        const box = screenBoxRef.current;
        if (box && pointInRectBox(e.point, box)) return;
        onCloseRef.current?.();
      };
      map.on("click", onMapClick);
      detachers.push(() => map.off("click", onMapClick));
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      detachers.forEach((d) => d());
      canvas.style.cursor = "";
      boundsRef.current = null;
      setScreenBox(null);
      setHideContent(false);
    };
  }, [map, active, recomputeBox, closeOnMapClick]);

  // --- Rectangle seeding: (re)seed on scale / orientation / redraw changes ---
  useEffect(() => {
    if (!map || !active) return;

    let disposed = false;

    const seed = () => {
      if (disposed) return;

      if (keepRectangle && boundsRef.current) {
        // Keep the existing rectangle (post-print); just reposition the overlay.
        recomputeBox();
        return;
      }

      const bounds = buildRectBounds(map, Number(scale), orientation);
      boundsRef.current = bounds;
      fitMapToRect(map, bounds);
      recomputeBox();
    };

    if (map.isStyleLoaded()) {
      seed();
    } else {
      map.once("load", seed);
    }

    return () => {
      disposed = true;
      map.off("load", seed);
    };
    // `redrawTrigger` is intentionally a dependency: changing it re-seeds.
  }, [map, active, orientation, scale, keepRectangle, redrawTrigger, recomputeBox]);

  if (!map || !active || !screenBox) return null;

  const fontSize = getPreviewFontSize(orientation, screenBox.width);
  const smallMode = getPreviewIsSmallMode(orientation, screenBox.width);

  return createPortal(
    <div
      id="carma-print-preview-overlay"
      ref={overlayRef}
      style={{
        top: screenBox.top,
        left: screenBox.left,
        width: screenBox.width,
        height: screenBox.height,
        fontSize,
      }}
    >
      <PrintPreviewControls
        orientation={orientation}
        scale={scale}
        dpi={dpi}
        loading={loading}
        hideContent={hideContent}
        smallMode={smallMode}
        previewWidth={screenBox.width}
        previewHeight={screenBox.height}
        fontSize={fontSize}
        onClose={() => onClose?.()}
        onPrint={startPrint}
        onUpdateScale={() => onRequestRedraw?.()}
      />
    </div>,
    map.getContainer()
  );
};

export default MapLibrePrintPreview;
