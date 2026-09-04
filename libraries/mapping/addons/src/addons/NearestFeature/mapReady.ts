import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * The two waits the ranking sequence needs: one for the style to actually carry
 * a layer, one for the map to have drawn what it was fitted to. Both resolve on
 * a timeout rather than hanging, so a missing layer ends in a row that says so.
 */

/** how long the layer and the style are waited for, in ms */
const STYLE_TIMEOUT = 10000;
/** how long the tiles are waited for, in ms */
const IDLE_TIMEOUT = 5000;

/**
 * Wait until the style carries a layer whose `metadata["carma-layer-id"]` is
 * the given catalog id. Adding a layer only dispatches it; the style then
 * rebuilds asynchronously, and ranking before that finds no source.
 */
export const waitForStyleLayer = (
  map: MaplibreMap,
  carmaLayerId: string
): Promise<boolean> =>
  new Promise((resolve) => {
    const isThere = () =>
      (map.getStyle()?.layers ?? []).some(
        (layer) =>
          (layer as { metadata?: Record<string, unknown> }).metadata?.[
            "carma-layer-id"
          ] === carmaLayerId
      );
    if (isThere()) {
      resolve(true);
      return;
    }
    const done = (found: boolean) => {
      map.off("styledata", onStyleData);
      clearTimeout(timer);
      resolve(found);
    };
    const onStyleData = () => {
      if (isThere()) {
        done(true);
      }
    };
    const timer = setTimeout(() => done(false), STYLE_TIMEOUT);
    map.on("styledata", onStyleData);
  });

/** Wait for the map to stop loading, so the hits are actually drawn. */
export const waitForIdle = (map: MaplibreMap): Promise<void> =>
  new Promise((resolve) => {
    const done = () => {
      map.off("idle", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, IDLE_TIMEOUT);
    map.once("idle", done);
  });
