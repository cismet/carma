/// <reference lib="webworker" />
import {
  indexViewportFootprints,
  selectViewportFootprints,
  selectFootprintAtPoint,
  type FootprintPointQuery,
  type FootprintViewportQuery,
  type ViewportFootprint,
} from "../../core/utils/viewport-footprints";

let index: ReturnType<typeof indexViewportFootprints> = [];
self.onmessage = (
  event: MessageEvent<
    | { type: "init"; catalog: ViewportFootprint[] }
    | { type: "query"; requestId: number; query: FootprintViewportQuery }
    | { type: "hover"; requestId: number; query: FootprintPointQuery }
  >
) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      index = indexViewportFootprints(message.catalog);
      self.postMessage({ type: "ready" });
    } else if (message.type === "hover") {
      self.postMessage({
        type: "hoverResult",
        requestId: message.requestId,
        id: selectFootprintAtPoint(index, message.query),
      });
    } else {
      self.postMessage({
        type: "result",
        requestId: message.requestId,
        ids: selectViewportFootprints(index, message.query),
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.type === "init" ? undefined : message.requestId,
      requestType: message.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
