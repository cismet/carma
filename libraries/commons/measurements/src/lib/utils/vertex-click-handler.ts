import type { LeafletMouseEvent, LeafletMap } from "@carma/leaflet";
import type { Control, Marker } from "leaflet";

const MEASUREMENT_VERTEX_ADD_DELAY_MS = 50;

type MeasureHandler = Control.DrawHandler & {
  _markers?: Marker[];
  _finishShape?: () => void;
  _poly?: { _latlngs?: unknown[] };
};

/**
 * Handler for vertex clicks during measurement drawing
 * Decides action based on which vertex was clicked:
 * - First vertex (with 3+ total): Close polygon
 * - Last vertex: Finish line
 * - Middle vertices: No action
 */
export function createVertexClickHandler(
  getMeasureHandler: () => MeasureHandler | null | undefined,
  options: Pick<Control.MeasurePolygonOptions, "shapeMode">,
  getCurrentVertexCount: () => number,
  map?: LeafletMap,
  getIsFinishingShape?: () => boolean,
  setIsFinishingShape?: (value: boolean) => void,
  getLastVertexTimestamp?: () => number
) {
  // Helper to handle common shape finishing logic
  const finishShape = (
    measureHandler: MeasureHandler,
    e: LeafletMouseEvent,
    debugLabel: string
  ) => {
    console.warn(
      `[measure-path] Finishing ${debugLabel} - triggering finish like double-click`
    );

    if (setIsFinishingShape) {
      setIsFinishingShape(true);
    }

    // Disable the handler after draw:created event fires
    if (map) {
      map.once("draw:created", () => {
        if (measureHandler.disable) {
          measureHandler.disable();
          console.log(
            "[measure-path] Disabled measurement handler after draw:created - ready for new measurement"
          );
        }
        // Reset flag on next tick to allow new measurements immediately
        // but still block the current bubbling click
        setTimeout(() => {
          console.debug(`reset finish shape flag (${debugLabel})`);
          if (setIsFinishingShape) setIsFinishingShape(false);
        }, 0);
      });
    }

    measureHandler._finishShape?.();
  };

  const handler = function (e: LeafletMouseEvent) {
    const measureHandler = getMeasureHandler();
    if (!measureHandler) {
      return; // No measure handler, ignore
    }

    // CRITICAL: Stop propagation immediately to prevent the map from receiving this click
    // This prevents Leaflet.Draw's map click handler from adding a new vertex when we click an existing one
    if (e.originalEvent) {
      e.originalEvent.stopPropagation();
      e.originalEvent.preventDefault();
    }
    const clickedMarker = e.target as any;
    const clickedHandle = clickedMarker.customHandle;

    if (clickedHandle === undefined || clickedHandle === null) {
      console.warn(
        "[measure-path] Clicked marker has no handle index",
        clickedMarker
      );
      return;
    }

    const markers = measureHandler._markers;
    if (!markers) return;

    const vertexCount = markers.length;
    const isFirst = clickedHandle === 0;
    const isLast = clickedHandle === vertexCount - 1;

    console.warn("[measure-path] Vertex clicked", {
      handle: clickedHandle,
      isFirst,
      isLast,
      totalVertices: vertexCount,
      eventType: e.originalEvent?.type,
    });

    // CRITICAL: Ignore clicks on the last vertex if it was just added (ghost clicks / touch bounce)
    if (isLast && getLastVertexTimestamp) {
      const lastAdded = getLastVertexTimestamp();
      const now = Date.now();
      if (now - lastAdded < MEASUREMENT_VERTEX_ADD_DELAY_MS) {
        console.warn(
          "[measure-path] Ignoring click on last vertex - too soon after addVertex",
          { diff: now - lastAdded }
        );
        return;
      }
    }

    // First vertex: close polygon (requires 3+ vertices and valid polyline data)
    if (isFirst && vertexCount >= 3) {
      const polyLatlngs = measureHandler._poly?._latlngs;
      if (!polyLatlngs || polyLatlngs.length < 3) {
        console.warn(
          "[measure-path] Cannot close polygon - polyline data not ready",
          {
            polyLatlngs: polyLatlngs?.length,
          }
        );
        return;
      }

      options.shapeMode = "polygon";
      finishShape(measureHandler, e, "polygon");
      return;
    }

    // Last vertex: finish line
    if (isLast) {
      finishShape(measureHandler, e, "line");
      return;
    }

    console.log("[measure-path] Middle vertex - no action");
  };

  return handler;
}
