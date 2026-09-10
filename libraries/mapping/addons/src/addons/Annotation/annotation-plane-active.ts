import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Whether the ground plane is carrying the drawing right now.
 *
 * Not a setting: the camera decides. Flat and north-up, a scene and the map
 * share one transform, so the overlay is the upright north-up scene it always
 * was — no per-frame matrix on the canvases, no pointer rewrite, no enlarged
 * plane box, and `useMapSceneSync` takes the cheap branch. The moment the
 * camera leaves that, the plane goes on and the drawing follows bearing and
 * pitch.
 *
 * Rotation counts as much as tilt: the flat branch lines the scene up through
 * a transform that has no bearing in it, so a turned map without the plane
 * puts the drawing next to where it belongs.
 */

/** how far off flat north-up still counts as flat, in degrees */
const FLAT_EPSILON = 0.5;

/** distance from north, 0…180, so 359° is one degree off and not 359 */
const offNorth = (bearing: number) =>
  Math.abs(((((bearing + 180) % 360) + 360) % 360) - 180);

const isTilted = (map: MaplibreMap) =>
  Math.abs(map.getPitch()) > FLAT_EPSILON ||
  offNorth(map.getBearing()) > FLAT_EPSILON;

export const usePlaneActive = (map: MaplibreMap | null): boolean => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!map) {
      setActive(false);
      return;
    }
    /**
     * On the moment the camera leaves flat, off only once it has come to rest
     * there. A gesture that tilts is already past what the flat branch can
     * show, so waiting for its end would drag the drawing along visibly wrong;
     * switching back mid-gesture, on the other hand, buys nothing and costs a
     * canvas resize and a full excalidraw re-render inside the gesture.
     */
    const check = (atRest: boolean) => {
      const tilted = isTilted(map);
      setActive((current) => (tilted ? true : atRest ? false : current));
    };
    const onMove = () => check(false);
    const onRest = () => check(true);

    check(true);
    map.on("move", onMove);
    map.on("moveend", onRest);
    return () => {
      map.off("move", onMove);
      map.off("moveend", onRest);
    };
  }, [map]);

  return active;
};

/**
 * What the plane and the decoration decided, for when a drawing comes out at a
 * size nothing in the code explains. Off, and free: one boolean per call.
 * `carmaAnnotationPlaneLog()` in the console turns it on.
 */
let logging = false;

export const planeLog = (tag: string, data: Record<string, unknown>) => {
  if (logging) {
    // eslint-disable-next-line no-console
    console.log(`[annotation-plane] ${tag}`, data);
  }
};

/** the console handle, installed once per document */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["carmaAnnotationPlaneLog"] = (
    next?: boolean
  ) => {
    logging = next === undefined ? !logging : next;
    return logging;
  };
}
