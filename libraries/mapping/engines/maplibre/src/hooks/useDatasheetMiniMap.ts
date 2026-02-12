/**
 * useDatasheetMiniMap - orchestrates position, transition, zoom sync, selection
 * sync, and opacity for a mini-map overlay used in datasheet (crossfade) mode.
 *
 * Returns computed inline styles; renders nothing itself.
 */

import { useState, useEffect, useRef, type RefObject } from "react";
import type maplibregl from "maplibre-gl";
import { useDatasheet } from "../contexts/DatasheetContext";
import { useMapSelection } from "../contexts/MapSelectionContext";
import { getCoordinates } from "../utils/featureUtils";

export interface UseDatasheetMiniMapOptions {
  /** Main map instance (from useLibreContext in the main map's provider) */
  mainMap: maplibregl.Map | null;
  /** Mini-map instance (from CarmaMap's setLibreMap callback) */
  miniMap: maplibregl.Map | null;
  /** Container ref for computing corner position */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Mini-map width in px */
  width?: number;
  /** Mini-map height in px */
  height?: number;
  /** Padding from container edge in px */
  padding?: number;
  /** CSS transition duration in ms */
  transitionMs?: number;
  /** Default zoom offset relative to main map */
  defaultZoomOffset?: number;
  /** Slow-mo transitions + red outline for debugging */
  debug?: boolean;
}

export interface UseDatasheetMiniMapResult {
  /** Computed inline style for the mini-map container div */
  containerStyle: React.CSSProperties;
  /** Computed inline style for the debug outline div; null when debug=false */
  debugOutlineStyle: React.CSSProperties | null;
  /** True when the close button should be shown */
  showCloseButton: boolean;
  /** Ref to attach to the mini-map container for mousewheel zoom */
  miniMapContainerRef: RefObject<HTMLDivElement | null>;
}

export function useDatasheetMiniMap(
  options: UseDatasheetMiniMapOptions
): UseDatasheetMiniMapResult {
  const {
    mainMap,
    miniMap,
    containerRef,
    width: MINI_MAP_W = 350,
    height: MINI_MAP_H = 220,
    padding: MINI_MAP_PAD = 16,
    transitionMs: rawTransitionMs = 200,
    defaultZoomOffset = 2,
    debug = false,
  } = options;

  const MINI_MAP_TRANSITION_MS = debug ? 1500 : rawTransitionMs;

  const { isDatasheetOpen } = useDatasheet();
  const { selectedFeatureId, rawFeature } = useMapSelection();

  // ---------------------------------------------------------------------------
  // Mini-map center: from selected feature geometry, or from last map click
  // ---------------------------------------------------------------------------
  const [miniMapCenter, setMiniMapCenter] = useState<
    [number, number] | undefined
  >();

  // Every click on the main map sets center to click location.
  // When a feature is selected, the rawFeature effect below overrides this.
  useEffect(() => {
    if (!mainMap) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      setMiniMapCenter([e.lngLat.lng, e.lngLat.lat]);
    };
    mainMap.on("click", onClick);
    return () => {
      mainMap.off("click", onClick);
    };
  }, [mainMap]);

  // Override center with feature geometry when a feature is selected
  useEffect(() => {
    if (!rawFeature?.geometry) return;
    const coords = getCoordinates(rawFeature.geometry);
    if (coords.length >= 2) {
      setMiniMapCenter([coords[0], coords[1]]);
    }
  }, [rawFeature]);

  // ---------------------------------------------------------------------------
  // Zoom offset (relative to main map, applied only in datasheet view)
  // ---------------------------------------------------------------------------
  const [miniMapZoomOffset, setMiniMapZoomOffset] = useState(defaultZoomOffset);
  const effectiveZoomOffset = isDatasheetOpen ? miniMapZoomOffset : 0;

  // ---------------------------------------------------------------------------
  // Two-phase CSS transition
  // ---------------------------------------------------------------------------
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [miniMapTarget, setMiniMapTarget] = useState<"feature" | "corner">(
    isDatasheetOpen ? "corner" : "feature"
  );
  const [miniMapOpacity, setMiniMapOpacity] = useState(isDatasheetOpen ? 1 : 0);
  const prevDatasheetRef = useRef(isDatasheetOpen);

  useEffect(() => {
    if (prevDatasheetRef.current === isDatasheetOpen) return;
    prevDatasheetRef.current = isDatasheetOpen;
    // Phase 1: enable transition CSS (position unchanged yet)
    setIsTransitioning(true);
    // Phase 2: change target position + opacity in next frame so transition kicks in
    requestAnimationFrame(() => {
      setMiniMapTarget(isDatasheetOpen ? "corner" : "feature");
      setMiniMapOpacity(isDatasheetOpen ? 1 : 0);
    });
    const timer = setTimeout(
      () => setIsTransitioning(false),
      MINI_MAP_TRANSITION_MS
    );
    return () => clearTimeout(timer);
  }, [isDatasheetOpen, MINI_MAP_TRANSITION_MS]);

  // ---------------------------------------------------------------------------
  // Center / zoom sync
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!miniMap || !miniMapCenter) return;
    const mainZoom = mainMap?.getZoom() ?? 15;
    miniMap.resize();
    if (isDatasheetOpen) {
      miniMap.easeTo({
        center: miniMapCenter,
        zoom: mainZoom + effectiveZoomOffset,
        duration: MINI_MAP_TRANSITION_MS,
      });
    } else {
      miniMap.jumpTo({
        center: miniMapCenter,
        zoom: mainZoom + effectiveZoomOffset,
      });
    }
  }, [
    miniMap,
    mainMap,
    miniMapCenter,
    isDatasheetOpen,
    effectiveZoomOffset,
    MINI_MAP_TRANSITION_MS,
  ]);

  // Animate zoom when toggling between map/datasheet view
  useEffect(() => {
    if (!miniMap || !mainMap || !isTransitioning) return;
    miniMap.easeTo({
      zoom: mainMap.getZoom() + effectiveZoomOffset,
      duration: MINI_MAP_TRANSITION_MS,
    });
  }, [
    miniMap,
    mainMap,
    effectiveZoomOffset,
    isTransitioning,
    MINI_MAP_TRANSITION_MS,
  ]);

  // Keep mini-map zoom in sync when main map zoom changes (instant)
  useEffect(() => {
    if (!mainMap || !miniMap) return;
    const onZoom = () => {
      miniMap.jumpTo({ zoom: mainMap.getZoom() + effectiveZoomOffset });
    };
    mainMap.on("zoom", onZoom);
    return () => {
      mainMap.off("zoom", onZoom);
    };
  }, [mainMap, miniMap, effectiveZoomOffset]);

  // ---------------------------------------------------------------------------
  // Position alignment: mini-map center aligns with feature's pixel position
  // ---------------------------------------------------------------------------
  const [miniMapPosition, setMiniMapPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!mainMap || !miniMapCenter) {
      setMiniMapPosition({ left: 0, top: 0 });
      return;
    }
    const update = () => {
      const pixel = mainMap.project(miniMapCenter);
      setMiniMapPosition({
        left: pixel.x - MINI_MAP_W / 2,
        top: pixel.y - MINI_MAP_H / 2,
      });
    };
    update();
    mainMap.on("move", update);
    return () => {
      mainMap.off("move", update);
    };
  }, [mainMap, miniMapCenter, MINI_MAP_W, MINI_MAP_H]);

  // ---------------------------------------------------------------------------
  // Feature-state selection sync on the mini-map
  // ---------------------------------------------------------------------------
  const prevSelectionRef = useRef<typeof selectedFeatureId>(null);

  useEffect(() => {
    if (!miniMap) return;
    const apply = () => {
      // Clear previous
      if (prevSelectionRef.current) {
        try {
          miniMap.setFeatureState(
            {
              source: prevSelectionRef.current.source,
              sourceLayer: prevSelectionRef.current.sourceLayer,
              id: prevSelectionRef.current.id,
            },
            { selected: false }
          );
        } catch {
          // source may not exist yet
        }
      }
      // Apply new
      if (selectedFeatureId) {
        try {
          miniMap.setFeatureState(
            {
              source: selectedFeatureId.source,
              sourceLayer: selectedFeatureId.sourceLayer,
              id: selectedFeatureId.id,
            },
            { selected: true }
          );
        } catch {
          // source may not exist yet
        }
      }
      prevSelectionRef.current = selectedFeatureId;
    };

    if (miniMap.isStyleLoaded()) {
      apply();
    } else {
      miniMap.once("styledata", apply);
    }
  }, [miniMap, selectedFeatureId]);

  // ---------------------------------------------------------------------------
  // Mousewheel zoom offset adjustment
  // ---------------------------------------------------------------------------
  const miniMapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = miniMapContainerRef.current;
    if (!el || !miniMap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY / 300;
      setMiniMapZoomOffset((prev) => {
        const next = Math.max(-5, Math.min(10, prev + delta));
        const mainZoom = mainMap?.getZoom() ?? 15;
        miniMap.jumpTo({ zoom: mainZoom + next });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [miniMap, mainMap]);

  // ---------------------------------------------------------------------------
  // Compute corner position from container dimensions
  // ---------------------------------------------------------------------------
  const containerWidth = containerRef.current?.clientWidth ?? 0;
  const containerHeight = containerRef.current?.clientHeight ?? 0;

  const cornerLeft = containerWidth - MINI_MAP_W - MINI_MAP_PAD;
  const cornerTop = containerHeight - MINI_MAP_H - MINI_MAP_PAD;

  const currentLeft =
    miniMapTarget === "corner" ? cornerLeft : miniMapPosition.left;
  const currentTop =
    miniMapTarget === "corner" ? cornerTop : miniMapPosition.top;

  // ---------------------------------------------------------------------------
  // Build CSS transition string
  // ---------------------------------------------------------------------------
  const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
  const d = MINI_MAP_TRANSITION_MS;
  const half = d / 2;

  const buildTransition = (includeOpacity: boolean): string => {
    if (!isTransitioning) return "none";
    const parts = [
      `left ${d}ms ${easing}`,
      `top ${d}ms ${easing}`,
      `border-radius ${d}ms ${easing}`,
    ];
    if (includeOpacity) {
      // Opening: fade in during first half
      // Closing: stay visible for first half, fade out during second half
      const opacityDelay = isDatasheetOpen ? 0 : half;
      parts.push(`box-shadow ${d}ms ${easing}`);
      parts.push(`opacity ${half}ms ${easing} ${opacityDelay}ms`);
    }
    return parts.join(", ");
  };

  // ---------------------------------------------------------------------------
  // Container style (the main mini-map wrapper)
  // ---------------------------------------------------------------------------
  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: currentLeft,
    top: currentTop,
    width: MINI_MAP_W,
    height: MINI_MAP_H,
    opacity: miniMapOpacity,
    visibility: !isDatasheetOpen && !isTransitioning ? "hidden" : "visible",
    zIndex: isDatasheetOpen || isTransitioning ? 30 : 0,
    borderRadius: miniMapTarget === "corner" ? 8 : 0,
    overflow: "hidden",
    boxShadow:
      miniMapTarget === "corner" ? "0 4px 20px rgba(0,0,0,0.3)" : "none",
    pointerEvents: isDatasheetOpen ? "auto" : "none",
    transition: buildTransition(true),
  };

  // ---------------------------------------------------------------------------
  // Debug outline style
  // ---------------------------------------------------------------------------
  const debugOutlineStyle: React.CSSProperties | null = debug
    ? {
        position: "absolute",
        left: currentLeft,
        top: currentTop,
        width: MINI_MAP_W,
        height: MINI_MAP_H,
        border: "3px solid red",
        borderRadius: miniMapTarget === "corner" ? 8 : 0,
        pointerEvents: "none",
        zIndex: 40,
        transition: buildTransition(false),
      }
    : null;

  return {
    containerStyle,
    debugOutlineStyle,
    showCloseButton: isDatasheetOpen,
    miniMapContainerRef,
  };
}
