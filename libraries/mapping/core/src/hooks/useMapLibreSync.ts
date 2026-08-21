import { useEffect } from "react";
import maplibregl from "maplibre-gl";

/** DIAGNOSTIC: leave true while you're debugging sync; flip back to false
 *  once the bug is understood. */
const LOG = true;
const log = (...args: unknown[]) => {
  if (LOG) console.debug("[MAPLIBRE-SYNC]", ...args);
};

/**
 * Mirror multiple MapLibre cameras.
 *
 * Every map's center / zoom / bearing / pitch is copied from whichever
 * map the USER interacted with. Used by CarmaMapCompare so every panel
 * shows the same geographic area; the stacked-with-clip layout then
 * decides which pixels from which panel actually reach the screen.
 *
 * Implementation: an `e.originalEvent` filter on the `move` handler.
 * MapLibre attaches `originalEvent` (the underlying pointer / wheel /
 * keyboard / touch DOM event) to `move` events that come from user
 * interaction, and leaves it undefined on `move` events emitted from
 * programmatic camera moves (our own `jumpTo`). So every listener can
 * simply skip events without `originalEvent`. No off / jump / on dance,
 * no reentrance guard. This sidesteps StrictMode's double-invoke
 * cleanup ordering problems entirely.
 */
export function useMapLibreSync(maps: maplibregl.Map[]) {
  useEffect(() => {
    log("effect", { count: maps?.length });
    if (!maps || maps.length < 2) return;

    // map -> its move handler, so we can detach the right one in cleanup.
    const handlers = new Map<maplibregl.Map, (e: unknown) => void>();

    const syncOthers = (source: maplibregl.Map, sourceIdx: number) => {
      const center = source.getCenter();
      const zoom = source.getZoom();
      const bearing = source.getBearing();
      const pitch = source.getPitch();
      log("user move from", sourceIdx, "->", maps.length - 1, "targets");
      maps.forEach((target, targetIdx) => {
        if (target === source) return;
        try {
          target.jumpTo({
            center: [center.lng, center.lat],
            zoom,
            bearing,
            pitch,
          });
          log("  jumped target", targetIdx);
        } catch (err) {
          log("  jumpTo failed on", targetIdx, err);
        }
      });
    };

    maps.forEach((map, idx) => {
      // The `any`-ish parameter is intentional: MapLibre's union of move
      // event shapes depends on the trigger, and we only care about the
      // presence of originalEvent.
      const fn = (e: unknown) => {
        const hasOriginal =
          typeof e === "object" &&
          e !== null &&
          "originalEvent" in e &&
          (e as { originalEvent: unknown }).originalEvent != null;
        if (!hasOriginal) return; // programmatic move (our own jumpTo), ignore
        syncOthers(map, idx);
      };
      handlers.set(map, fn);
      try {
        map.on("move", fn);
        log("attached listener to map", idx);
      } catch (err) {
        log("attach failed on", idx, err);
      }
    });

    return () => {
      maps.forEach((map, idx) => {
        const fn = handlers.get(map);
        if (!fn) return;
        try {
          map.off("move", fn);
          log("detached listener from map", idx);
        } catch {
          /* map may already be disposed */
        }
      });
    };
  }, [maps]);
}
