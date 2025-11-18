import { Layer, LeafletMouseEvent, Control, Marker } from "leaflet";

/**
 * Handler for vertex clicks during measurement drawing
 * Decides action based on which vertex was clicked:
 * - First vertex (with 3+ total): Close polygon
 * - Last vertex: Finish line
 * - Middle vertices: No action
 */
export function createVertexClickHandler(
  measureHandler: Control.DrawHandler & {
    _markers?: Marker[];
    _finishShape?: () => void;
    _poly?: { _latlngs?: unknown[] };
  },
  options: Pick<Control.MeasurePolygonOptions, "shapeMode">,
  getCurrentVertexCount: () => number
) {
  return function (e: LeafletMouseEvent & { target: Layer }) {
    const clickedHandle = e.target.customHandle ?? 0;
    const vertexCount = getCurrentVertexCount();
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
      console.warn("[measure-path] Closing polygon");
      options.shapeMode = "polygon";
      measureHandler.completeShape?.();
      return;
    }

    // Last vertex: finish line
    if (isLast) {
      console.warn("[measure-path] Finishing line");
      measureHandler._finishShape?.();
      return;
    }

    console.log("[measure-path] Middle vertex - no action");
  };
}
