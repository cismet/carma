import { useCallback, useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

type Camera = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

export type RegisterOptions = {
  /**
   * Follow only once the movement settles instead of on every frame.
   *
   * For a map that is registered to stay in step but is not on screen: it costs
   * a full render pass per frame like any other, and that pass competes with
   * the panels the user is actually watching.
   */
  deferred?: boolean;
};

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
 *
 * A deferred map is held back to `moveend`, and the camera it owes is kept as a
 * plain snapshot rather than as a reference to the map it came from, so the
 * flush still lands after the source map has been torn down.
 */
export const useCameraSync = () => {
  const mapsRef = useRef<Map<string, MaplibreMap>>(new Map());
  const handlersRef = useRef<
    Map<MaplibreMap, { move: () => void; moveend: () => void }>
  >(new Map());
  const deferredRef = useRef<Set<MaplibreMap>>(new Set());
  /** the camera the deferred maps still owe, if any */
  const pendingRef = useRef<Camera | null>(null);

  const detachAll = useCallback(() => {
    handlersRef.current.forEach((handlers, map) => {
      try {
        map.off("move", handlers.move);
        map.off("moveend", handlers.moveend);
      } catch {
        /* disposed */
      }
    });
  }, []);

  const attachAll = useCallback(() => {
    handlersRef.current.forEach((handlers, map) => {
      try {
        map.on("move", handlers.move);
        map.on("moveend", handlers.moveend);
      } catch {
        /* disposed */
      }
    });
  }, []);

  const applyCamera = useCallback(
    (camera: Camera, targets: MaplibreMap[]) => {
      if (targets.length === 0) {
        return;
      }
      detachAll();
      targets.forEach((target) => {
        try {
          target.jumpTo(camera);
          // `jumpTo` only asks for a repaint, and `triggerRepaint` schedules it
          // through `requestAnimationFrame`. We are running inside the source
          // map's own frame, so that request lands in the next one and every
          // target trails the source by a frame, which is visible as the panels
          // lagging behind the one being dragged. `redraw` cancels the pending
          // request and renders here, in the frame the camera changed in.
          target.redraw();
        } catch {
          /* disposed */
        }
      });
      attachAll();
    },
    [attachAll, detachAll]
  );

  /** hand the deferred maps the camera they were held back from */
  const flushDeferred = useCallback(() => {
    const camera = pendingRef.current;
    if (!camera) {
      return;
    }
    pendingRef.current = null;
    applyCamera(camera, Array.from(deferredRef.current));
  }, [applyCamera]);

  const syncFrom = useCallback(
    (source: MaplibreMap) => {
      let camera: Camera;
      try {
        const center = source.getCenter();
        camera = {
          center: [center.lng, center.lat],
          zoom: source.getZoom(),
          bearing: source.getBearing(),
          pitch: source.getPitch(),
        };
      } catch {
        return; /* disposed */
      }

      const live: MaplibreMap[] = [];
      let holdsDeferred = false;
      mapsRef.current.forEach((target) => {
        if (target === source) {
          return;
        }
        if (deferredRef.current.has(target)) {
          holdsDeferred = true;
          return;
        }
        live.push(target);
      });

      // remembered even when the source is itself deferred, so the app map
      // driving the panels still leaves the others with something to flush
      if (holdsDeferred) {
        pendingRef.current = camera;
      }
      applyCamera(camera, live);
    },
    [applyCamera]
  );

  /**
   * Called with each map as it becomes available. `key` identifies the slot, so
   * a remount replacing the map in a slot detaches the old one first instead of
   * leaving a listener on an instance nobody can reach any more.
   */
  const register = useCallback(
    (key: string, map: MaplibreMap | null, options?: RegisterOptions) => {
      const previous = mapsRef.current.get(key);
      if (previous && previous !== map) {
        const handlers = handlersRef.current.get(previous);
        if (handlers) {
          try {
            previous.off("move", handlers.move);
            previous.off("moveend", handlers.moveend);
          } catch {
            /* disposed */
          }
          handlersRef.current.delete(previous);
        }
        deferredRef.current.delete(previous);
        mapsRef.current.delete(key);
      }
      if (!map) {
        return;
      }
      mapsRef.current.set(key, map);
      if (options?.deferred) {
        deferredRef.current.add(map);
      } else {
        deferredRef.current.delete(map);
      }
      if (handlersRef.current.has(map)) {
        return;
      }
      const handlers = {
        move: () => syncFrom(map),
        // the movement this map was the source of has come to rest, so whatever
        // was held back can be handed over without costing a drag frame
        moveend: () => flushDeferred(),
      };
      handlersRef.current.set(map, handlers);
      try {
        map.on("move", handlers.move);
        map.on("moveend", handlers.moveend);
      } catch {
        /* disposed */
      }
    },
    [flushDeferred, syncFrom]
  );

  useEffect(
    () => () => {
      // leaving the mode reveals the app map, and a deferred map that never got
      // its last camera would reveal the wrong place
      flushDeferred();
      handlersRef.current.forEach((handlers, map) => {
        try {
          map.off("move", handlers.move);
          map.off("moveend", handlers.moveend);
        } catch {
          /* disposed */
        }
      });
      handlersRef.current.clear();
      mapsRef.current.clear();
      deferredRef.current.clear();
    },
    [flushDeferred]
  );

  return { register, syncFrom, flushDeferred };
};
