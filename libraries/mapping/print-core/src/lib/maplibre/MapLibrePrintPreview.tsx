// MapLibre print preview — the engine-coupled analog of the geoportal
// PrintPreview.tsx (Leaflet). It draws the draggable print rectangle on the
// map, overlays the controls on top of it, keeps both in sync as the map
// pans / zooms, and submits the MapFish print job via the core printMap().
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
import {
  PREVIEW_FILL_LAYER_ID,
  PREVIEW_SOURCE_ID,
  attachRectDblClick,
  attachRectDrag,
  buildRectBounds,
  ensureRectLayers,
  fitMapToRect,
  getRectCenter3857,
  getRectScreenBox,
  removeRectLayers,
  updateRectData,
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

  // Latest-value refs so the map-level listeners (attached once per active
  // session) always read fresh props without being re-bound on every change.
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const printRef = useRef<() => void>(() => undefined);

  const recomputeBox = useCallback(() => {
    if (!map || !boundsRef.current) return;
    setScreenBox(getRectScreenBox(map, boundsRef.current));
  }, [map]);

  const applyBounds = useCallback(
    (bounds: RectBounds) => {
      if (!map) return;
      boundsRef.current = bounds;
      updateRectData(map, bounds);
      recomputeBox();
    },
    [map, recomputeBox]
  );

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
      onError,
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

    const detachers: Array<() => void> = [];

    const bindInteractions = () => {
      detachers.push(
        attachRectDrag(map, {
          getBounds: () => boundsRef.current,
          applyBounds,
          onDragStart: () => setHideContent(true),
          // fitBounds → 'moveend' recomputes the box and reveals the overlay.
          onDragEnd: (b) => fitMapToRect(map, b),
          isEnabled: () => !loadingRef.current,
        })
      );
      detachers.push(attachRectDblClick(map, () => printRef.current()));

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

      if (closeOnMapClick) {
        const onMapClick = (e: MapMouseEvent) => {
          const hits = map.queryRenderedFeatures(e.point, {
            layers: map.getLayer(PREVIEW_FILL_LAYER_ID)
              ? [PREVIEW_FILL_LAYER_ID]
              : [],
          });
          if (hits.length === 0) onCloseRef.current?.();
        };
        map.on("click", onMapClick);
        detachers.push(() => map.off("click", onMapClick));
      }
    };

    bindInteractions();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      detachers.forEach((d) => d());
      removeRectLayers(map);
      boundsRef.current = null;
      setScreenBox(null);
      setHideContent(false);
    };
  }, [map, active, applyBounds, recomputeBox, closeOnMapClick]);

  // --- Rectangle seeding: (re)seed on scale / orientation / redraw changes ---
  useEffect(() => {
    if (!map || !active) return;

    let disposed = false;

    const seed = () => {
      if (disposed) return;
      const hasRect =
        boundsRef.current !== null && !!map.getSource(PREVIEW_SOURCE_ID);

      if (keepRectangle && hasRect && boundsRef.current) {
        // Keep the existing rectangle (post-print); just make sure the layers
        // are present and the overlay is positioned.
        ensureRectLayers(map, boundsRef.current);
        recomputeBox();
        return;
      }

      const bounds = buildRectBounds(map, Number(scale), orientation);
      boundsRef.current = bounds;
      ensureRectLayers(map, bounds);
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
