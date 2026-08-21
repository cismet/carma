import { useCallback, useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Keeps a set of maps on one camera.
 *
 * The pattern is mapbox-gl-sync-move's and the reason it works is the order:
 * detach every `move` listener, `jumpTo` all the others, reattach. The jumped
 * maps do emit `move`, but at that moment nothing is listening, so there is no
 * way for the sync to feed itself. Filtering on `originalEvent` instead would
 * be guesswork about which MapLibre event shapes carry one.
 *
 * Registration happens the moment a map arrives, not in an effect. Child
 * effects run before parent effects, so a parent that subscribed in its own
 * effect would be attaching to maps its children were about to replace, and
 * under StrictMode it ends up subscribed to destroyed instances while the maps
 * on screen have no listener at all.
 *
 * Any registered map may be the source, which is what lets the app's own hidden
 * map drive the panels when the user works the zoom or home button, and the
 * panels drive it back when the user drags one of them.
 */
export const useCameraSync = () => {
  const mapsRef = useRef<Map<string, MaplibreMap>>(new Map());
  const handlersRef = useRef<Map<MaplibreMap, () => void>>(new Map());

  const syncFrom = useCallback((source: MaplibreMap) => {
    handlersRef.current.forEach((handler, map) => {
      try {
        map.off("move", handler);
      } catch {
        /* disposed */
      }
    });

    const center = source.getCenter();
    const zoom = source.getZoom();
    const bearing = source.getBearing();
    const pitch = source.getPitch();

    mapsRef.current.forEach((target) => {
      if (target === source) {
        return;
      }
      try {
        target.jumpTo({
          center: [center.lng, center.lat],
          zoom,
          bearing,
          pitch,
        });
      } catch {
        /* disposed */
      }
    });

    handlersRef.current.forEach((handler, map) => {
      try {
        map.on("move", handler);
      } catch {
        /* disposed */
      }
    });
  }, []);

  /**
   * Called with each map as it becomes available. `key` identifies the slot, so
   * a remount replacing the map in a slot detaches the old one first instead of
   * leaving a listener on an instance nobody can reach any more.
   */
  const register = useCallback(
    (key: string, map: MaplibreMap | null) => {
      const previous = mapsRef.current.get(key);
      if (previous && previous !== map) {
        const handler = handlersRef.current.get(previous);
        if (handler) {
          try {
            previous.off("move", handler);
          } catch {
            /* disposed */
          }
          handlersRef.current.delete(previous);
        }
        mapsRef.current.delete(key);
      }
      if (!map) {
        return;
      }
      mapsRef.current.set(key, map);
      if (handlersRef.current.has(map)) {
        return;
      }
      const handler = () => syncFrom(map);
      handlersRef.current.set(map, handler);
      try {
        map.on("move", handler);
      } catch {
        /* disposed */
      }
    },
    [syncFrom]
  );

  useEffect(
    () => () => {
      handlersRef.current.forEach((handler, map) => {
        try {
          map.off("move", handler);
        } catch {
          /* disposed */
        }
      });
      handlersRef.current.clear();
      mapsRef.current.clear();
    },
    []
  );

  return { register, syncFrom };
};
