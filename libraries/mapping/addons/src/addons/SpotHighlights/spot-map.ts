import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as LibreMap } from "maplibre-gl";

import { claimClick } from "@carma-mapping/engines/maplibre";
import { lngLatToMercator } from "@carma-mapping/show-remote";

import { spotAt, spotPreviewFeatures, wheelPixels } from "./spot-geometry";
import type { Spot, SpotLayerContent } from "./spot-layer";

const LOG_PREFIX = "[SPOT HIGHLIGHTS]";

const SOURCE_ID = "spot-highlights";
const COVER_LAYER_ID = "spot-highlights-cover";
const RING_LAYER_ID = "spot-highlights-ring";
const MIDDLE_LAYER_ID = "spot-highlights-middle";
const LAYER_IDS = [COVER_LAYER_ID, RING_LAYER_ID, MIDDLE_LAYER_ID];
const RING_COLOR = "#f59e0b";
const MIDDLE_COLOR = "#f97316";
/** a press that moved further than this is a drag, not a click */
const CLICK_TOLERANCE_PX = 3;

/**
 * Draws the spots while `content` is set and takes them off again when it is
 * null. A base map swap throws every layer away, so they go back on after
 * each style change.
 */
export const useSpotMapLayers = (
  map: LibreMap | null,
  content: SpotLayerContent | null
): void => {
  const dataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  dataRef.current = content
    ? spotPreviewFeatures(content.spots, content.dim)
    : null;
  /** the attach of the current map, for changed spots to go through */
  const attachRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!map) return undefined;

    const remove = (): void => {
      if (!map.getStyle()) return;
      for (const id of [...LAYER_IDS].reverse()) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
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
      if (!map.getLayer(MIDDLE_LAYER_ID)) {
        map.addLayer({
          id: MIDDLE_LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "middle"],
          paint: { "circle-color": MIDDLE_COLOR, "circle-radius": 5 },
        });
      }
    };

    const attach = (): void => {
      try {
        place();
      } catch (error) {
        // a style still loading refuses new sources; its `styledata` retries
        console.debug(`${LOG_PREFIX} waits for the style`, error);
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

  // the data travels through the ref; changed spots go on right away
  const signature = content ? JSON.stringify(content) : "";
  useEffect(() => {
    attachRef.current?.();
  }, [map, signature]);
};

export type SpotEditing = {
  /** the ribbon is open: the wheel and drags on a spot belong to the spots */
  isEditing: boolean;
  /** the next click places a spot */
  isPlacing: boolean;
  spots: readonly Spot[];
  onPlace: (center: [number, number]) => void;
  onCancelPlacing: () => void;
  /** the wheel over a spot, in pixels; negative is away from the user */
  onResize: (id: string, pixels: number) => void;
  /** the wheel anywhere else */
  onDim: (pixels: number) => void;
  onMove: (id: string, center: [number, number]) => void;
};

/**
 * The pointer on the map while the spots are edited.
 *
 * Placing: the next click puts a spot there instead of reaching the map's own
 * selection. Escape gives up.
 *
 * Editing: the wheel no longer zooms. Over a spot it makes the spot larger or
 * smaller, anywhere else it makes the rest darker or lighter. A spot dragged
 * moves, and the map stays where it is.
 */
export const useSpotEditing = (
  map: LibreMap | null,
  editing: SpotEditing
): void => {
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const { isEditing, isPlacing } = editing;

  useEffect(() => {
    if (!map || !isPlacing) return undefined;
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
      editingRef.current.onPlace(mercatorAt(map, event));
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") editingRef.current.onCancelPlacing();
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
  }, [map, isPlacing]);

  useEffect(() => {
    if (!map || !isEditing) return undefined;
    const container = map.getCanvasContainer();
    const canvas = map.getCanvas();
    const scrollZoomWasOn = map.scrollZoom.isEnabled();
    map.scrollZoom.disable();

    type Drag = {
      id: string;
      /** from the pointer to the spot's middle, so it does not jump */
      offset: [number, number];
      startX: number;
      startY: number;
      moved: boolean;
      dragPanWasOn: boolean;
    };
    let drag: Drag | null = null;
    /** the click that ends a press on a spot is the spot's, not the map's */
    let swallowClick = false;

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const { spots, onResize, onDim } = editingRef.current;
      const pixels = wheelPixels(event.deltaY, event.deltaMode);
      if (pixels === 0) return;
      const spot = spotAt(spots, mercatorAt(map, event));
      if (spot) {
        onResize(spot.id, pixels);
      } else {
        onDim(pixels);
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      // a drag let go off the map sends the map no click; the next press
      // starts afresh, so no later click is taken for the spot's
      swallowClick = false;
      if (event.button !== 0 || editingRef.current.isPlacing) return;
      const point = mercatorAt(map, event);
      const spot = spotAt(editingRef.current.spots, point);
      if (!spot) return;
      // the map must not pan under the spot; its mouse events stay away too
      event.preventDefault();
      event.stopPropagation();
      const dragPanWasOn = map.dragPan.isEnabled();
      map.dragPan.disable();
      drag = {
        id: spot.id,
        offset: [spot.center[0] - point[0], spot.center[1] - point[1]],
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        dragPanWasOn,
      };
      swallowClick = true;
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd);
      window.addEventListener("pointercancel", onDragEnd);
    };

    const onDragMove = (event: PointerEvent): void => {
      if (!drag) return;
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <=
          CLICK_TOLERANCE_PX
      ) {
        return;
      }
      drag.moved = true;
      const [x, y] = mercatorAt(map, event);
      editingRef.current.onMove(drag.id, [x + drag.offset[0], y + drag.offset[1]]);
    };

    const endDrag = (): void => {
      if (!drag) return;
      if (drag.dragPanWasOn) map.dragPan.enable();
      drag = null;
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragEnd);
    };
    const onDragEnd = (): void => endDrag();

    const onClick = (event: MouseEvent): void => {
      if (!swallowClick) return;
      swallowClick = false;
      claimClick(event);
      event.stopPropagation();
    };

    /** a spot under the pointer says it can be moved */
    const onHover = (event: PointerEvent): void => {
      if (drag || editingRef.current.isPlacing) return;
      const spot = spotAt(editingRef.current.spots, mercatorAt(map, event));
      canvas.style.cursor = spot ? "move" : "";
    };

    container.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("click", onClick, true);
    container.addEventListener("pointermove", onHover);
    return () => {
      endDrag();
      container.removeEventListener("wheel", onWheel, { capture: true });
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("pointermove", onHover);
      if (!editingRef.current.isPlacing) canvas.style.cursor = "";
      if (scrollZoomWasOn) map.scrollZoom.enable();
    };
  }, [map, isEditing]);
};

/** where on the map an event happened, EPSG:3857 */
const mercatorAt = (
  map: LibreMap,
  event: MouseEvent
): [number, number] => {
  const rect = map.getCanvas().getBoundingClientRect();
  const at = map.unproject([
    event.clientX - rect.left,
    event.clientY - rect.top,
  ]);
  return lngLatToMercator([at.lng, at.lat]);
};
