import type { LeafletMouseEvent } from "@carma/leaflet";
import type { Layer, Control, Marker } from "leaflet";

/**
 * Handler for vertex clicks during measurement drawing
 * Decides action based on which vertex was clicked:
 * - First vertex (with 3+ total): Close polygon
 * - Last vertex: Finish line
 * - Middle vertices: No action
 */
export function createVertexClickHandler(
  getMeasureHandler: () =>
    | (Control.DrawHandler & {
        _markers?: Marker[];
        _finishShape?: () => void;
        _poly?: { _latlngs?: unknown[] };
      })
    | null
    | undefined,
  options: Pick<Control.MeasurePolygonOptions, "shapeMode">,
  getCurrentVertexCount: () => number,
  map?: any,
  getIsFinishingShape?: () => boolean,
  setIsFinishingShape?: (value: boolean) => void
) {
  const handler = function (e: LeafletMouseEvent) {
    const measureHandler = getMeasureHandler();
    if (!measureHandler) {
      return; // No measure handler, ignore
    }

    // Find if we clicked on a vertex marker by checking the markers
    const markers = measureHandler._markers;
    if (!markers || markers.length === 0) {
      return; // No markers yet
    }

    // Check if click is on any of the vertex markers
    let clickedMarker = null;
    let clickedHandle = -1;

    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i] as any;
      if (marker._icon && marker._icon.contains(e.originalEvent?.target)) {
        clickedMarker = marker;
        clickedHandle = marker.customHandle ?? i;
        break;
      }
    }

    if (clickedMarker === null) {
      return; // Not a vertex marker click
    }

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
      console.warn(
        "[measure-path] Closing polygon - triggering finish like double-click"
      );
      options.shapeMode = "polygon";

      // Set flag to prevent map click handler from starting new measurement
      if (setIsFinishingShape) {
        setIsFinishingShape(true);
      }

      // Add the first vertex again to close the polygon, then finish
      const firstLatLng = measureHandler._markers[0]?.getLatLng();
      if (firstLatLng) {
        measureHandler.addVertex?.(firstLatLng);
      }

      // Trigger finish like double-click does
      measureHandler._finishShape?.();

      // Stop propagation to prevent map click handler from starting new measurement
      e.originalEvent?.stopPropagation?.();
      e.originalEvent?.preventDefault?.();

      // Disable the handler after draw:created event fires
      if (map) {
        map.once("draw:created", () => {
          if (measureHandler.disable) {
            measureHandler.disable();
            console.log(
              "[measure-path] Disabled measurement handler after draw:created - ready for new measurement"
            );
          }
        });
      }
      return;
    }

    // Last vertex: finish line
    if (isLast) {
      console.warn(
        "[measure-path] Finishing line - will disable handler after completion"
      );

      // Set flag to prevent map click handler from starting new measurement
      if (setIsFinishingShape) {
        setIsFinishingShape(true);
      }

      measureHandler._finishShape?.();

      // Stop propagation to prevent map click handler from starting new measurement
      e.originalEvent?.stopPropagation?.();
      e.originalEvent?.preventDefault?.();

      // Disable the handler after draw:created event fires
      if (map) {
        map.once("draw:created", () => {
          if (measureHandler.disable) {
            measureHandler.disable();
            console.log(
              "[measure-path] Disabled measurement handler after draw:created - ready for new measurement"
            );
          }
        });
      }
      return;
    }

    console.log("[measure-path] Middle vertex - no action");
  };

  return handler;
}
