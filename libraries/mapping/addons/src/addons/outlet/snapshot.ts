import type { Map as LibreMap } from "maplibre-gl";

/** wide enough to tell the model's sides apart on a phone, small for the relay */
const SNAPSHOT_WIDTH_PX = 480;
const SNAPSHOT_QUALITY = 0.7;
/**
 * The render loop stalls while the window is occluded, and with it the draw
 * the picture waits for.
 */
const RENDER_TIMEOUT_MS = 3000;

/** part of the window in css pixels */
export type SnapshotBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MapPicture = { image: string; width: number; height: number };

/**
 * The map as it is drawn, cut to `box` (the model's rectangle) and scaled
 * down to a JPEG data url. The drawing buffer is only readable in the task
 * that drew it, so the copy happens in the next `render` event, which a
 * repaint forces; the map keeps `preserveDrawingBuffer` off. Anything drawn
 * over the map rather than into it (the spot, the blackout) is not in it.
 */
export const captureMap = (
  map: LibreMap,
  box: SnapshotBox | null
): Promise<MapPicture> =>
  new Promise((resolve, reject) => {
    const onRender = () => {
      window.clearTimeout(timer);
      map.off("render", onRender);
      try {
        const source = map.getCanvas();
        const scale = source.width / Math.max(source.clientWidth, 1);
        const cut = box ?? {
          left: 0,
          top: 0,
          width: source.clientWidth,
          height: source.clientHeight,
        };
        if (cut.width <= 0 || cut.height <= 0) {
          throw new Error("the model's rectangle is empty");
        }
        const width = Math.min(
          SNAPSHOT_WIDTH_PX,
          Math.round(cut.width * scale)
        );
        const height = Math.max(
          1,
          Math.round((width * cut.height) / cut.width)
        );
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("no 2d context for the picture");
        }
        // what lies outside the window stays black, as on the model
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
        context.drawImage(
          source,
          cut.left * scale,
          cut.top * scale,
          cut.width * scale,
          cut.height * scale,
          0,
          0,
          width,
          height
        );
        resolve({
          image: canvas.toDataURL("image/jpeg", SNAPSHOT_QUALITY),
          width,
          height,
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const timer = window.setTimeout(() => {
      map.off("render", onRender);
      reject(new Error("the map did not draw, the window may be hidden"));
    }, RENDER_TIMEOUT_MS);
    map.on("render", onRender);
    map.triggerRepaint();
  });
