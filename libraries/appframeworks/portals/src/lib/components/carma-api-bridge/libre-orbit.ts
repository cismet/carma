import type maplibregl from "maplibre-gl";

/** seconds per full turn */
const REVOLUTION_SEC = 30;

/** input on the map that ends the orbit, so the user takes over at once */
const STOP_EVENTS = ["mousedown", "touchstart", "wheel", "keydown"] as const;

export type LibreOrbit = {
  readonly map: maplibregl.Map;
  readonly isOrbiting: boolean;
  start: () => void;
  stop: () => void;
  destroy: () => void;
};

/**
 * Turns the MapLibre camera around the middle of the current view: the
 * bearing advances every frame, pitch and zoom stay as they are. Advancing by
 * elapsed time keeps the speed independent of the frame rate.
 */
export const createLibreOrbit = (map: maplibregl.Map): LibreOrbit => {
  let frame: number | null = null;
  let lastTime: number | null = null;
  const container = map.getCanvasContainer();

  const step = (time: number) => {
    if (lastTime !== null) {
      const deltaSec = (time - lastTime) / 1000;
      map.setBearing(map.getBearing() + (360 * deltaSec) / REVOLUTION_SEC);
    }
    lastTime = time;
    frame = requestAnimationFrame(step);
  };

  const stop = () => {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
    STOP_EVENTS.forEach((type) => container.removeEventListener(type, stop));
    map.off("remove", stop);
  };

  const start = () => {
    if (frame !== null) return;
    STOP_EVENTS.forEach((type) =>
      container.addEventListener(type, stop, { passive: true })
    );
    map.on("remove", stop);
    frame = requestAnimationFrame(step);
  };

  return {
    map,
    get isOrbiting() {
      return frame !== null;
    },
    start,
    stop,
    destroy: stop,
  };
};
