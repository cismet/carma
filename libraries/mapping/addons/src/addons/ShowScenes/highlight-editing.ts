import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as LibreMap } from "maplibre-gl";

import { claimClick } from "@carma-mapping/engines/maplibre";
import {
  highlightRing,
  lngLatToMercator,
  type ShowHighlight,
} from "@carma-mapping/show-remote";

/**
 * Placing and showing a scene's stored highlights on the pm-show map.
 *
 * The preview is a pair of map layers, not the display's canvas cover: here
 * the map is the one the show is put together on, so it has to stay usable,
 * and a click on it has to reach the next highlight's place. The cover is
 * therefore lighter than on the display, and every spot gets an outline.
 */

const SOURCE_ID = "show-scenes-highlights";
const COVER_LAYER_ID = "show-scenes-highlights-cover";
const RING_LAYER_ID = "show-scenes-highlights-ring";
/** the preview darkens only this share of what the display will */
const PREVIEW_DIM_SHARE = 0.6;
const RING_COLOR = "#f59e0b";
/** a press that moved further than this is a drag, not a placing click */
const CLICK_TOLERANCE_PX = 3;
/** outer ring of the cover; Web Mercator ends short of the poles */
const WORLD_RING: [number, number][] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

/**
 * The preview as GeoJSON: one cover with a hole per spot, darkened like the
 * strongest of them, and one outline per spot.
 */
export const highlightPreviewFeatures = (
  highlights: readonly ShowHighlight[]
): GeoJSON.FeatureCollection => {
  const rings = highlights.map((highlight) => highlightRing(highlight));
  const dim = Math.max(0, ...highlights.map(({ dim }) => dim));
  return {
    type: "FeatureCollection",
    features: [
      ...(highlights.length > 0
        ? [
            {
              type: "Feature" as const,
              properties: { kind: "cover", dim: dim * PREVIEW_DIM_SHARE },
              geometry: {
                type: "Polygon" as const,
                // holes wind the other way round than the outer ring
                coordinates: [
                  WORLD_RING,
                  ...rings.map((ring) => [...ring].reverse()),
                ],
              },
            },
          ]
        : []),
      ...highlights.map((highlight, index) => ({
        type: "Feature" as const,
        properties: { kind: "ring", id: highlight.id },
        geometry: { type: "LineString" as const, coordinates: rings[index] },
      })),
    ],
  };
};

/**
 * Shows the highlights on the map while `highlights` is set, and takes them
 * off again when it is null. A basemap swap throws every layer away, so they
 * go back on after each style change.
 */
export const useHighlightPreview = (
  map: LibreMap | null,
  highlights: readonly ShowHighlight[] | null
): void => {
  const dataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  dataRef.current = highlights ? highlightPreviewFeatures(highlights) : null;
  /** the attach of the current map, for a changed list to go through */
  const attachRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!map) return undefined;

    const remove = (): void => {
      if (!map.getStyle()) return;
      for (const id of [RING_LAYER_ID, COVER_LAYER_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    const attach = (): void => {
      try {
        place();
      } catch (error) {
        // a style still loading refuses new sources; its `styledata` retries
        console.debug("[SHOW SCENES] highlight preview waits for the style", error);
      }
    };

    const place = (): void => {
      const data = dataRef.current;
      if (!map.getStyle()) return;
      if (!data) {
        remove();
        return;
      }
      const source = map.getSource(SOURCE_ID);
      if (source && source.type === "geojson") {
        (source as GeoJSONSource).setData(data);
      } else if (!source) {
        map.addSource(SOURCE_ID, { type: "geojson", data });
      }
      if (!map.getLayer(COVER_LAYER_ID)) {
        map.addLayer({
          id: COVER_LAYER_ID,
          type: "fill",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "cover"],
          paint: { "fill-color": "#000000", "fill-opacity": ["get", "dim"] },
        });
      }
      if (!map.getLayer(RING_LAYER_ID)) {
        map.addLayer({
          id: RING_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "ring"],
          paint: {
            "line-color": RING_COLOR,
            "line-width": 2,
            "line-dasharray": [2, 1],
          },
        });
      }
    };

    attachRef.current = attach;
    attach();
    map.on("styledata", attach);
    return () => {
      attachRef.current = null;
      map.off("styledata", attach);
      remove();
    };
  }, [map]);

  // the data travels through the ref; a changed list goes on right away
  const signature = highlights ? JSON.stringify(highlights) : "";
  useEffect(() => {
    attachRef.current?.();
  }, [map, signature]);
};

/**
 * While `isActive`, the next click on the map places a highlight there
 * (EPSG:3857) instead of reaching the map's own selection. Escape gives up.
 */
export const useHighlightPlacement = (
  map: LibreMap | null,
  isActive: boolean,
  onPlace: (center: [number, number]) => void,
  onCancel: () => void
): void => {
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!map || !isActive) return undefined;
    const container = map.getCanvasContainer();
    const canvas = map.getCanvas();
    let pressedAt: { x: number; y: number } | null = null;
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    const onPointerDown = (event: PointerEvent): void => {
      pressedAt = { x: event.clientX, y: event.clientY };
    };
    const onClick = (event: MouseEvent): void => {
      if (
        pressedAt &&
        Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >
          CLICK_TOLERANCE_PX
      ) {
        return;
      }
      claimClick(event);
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const at = map.unproject([
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
      onPlaceRef.current(lngLatToMercator([at.lng, at.lat]));
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancelRef.current();
    };

    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown);
      canvas.style.cursor = previousCursor;
    };
  }, [map, isActive]);
};
