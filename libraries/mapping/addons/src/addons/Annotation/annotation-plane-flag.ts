import { useCallback, useSyncExternalStore } from "react";

/**
 * The kill switch for the ground plane.
 *
 * One flag, three things: the per-frame matrix on the canvases, the pointer
 * rewrite, and the enlarged plane box. Off, none of them is installed and the
 * overlay is the flat north-up scene it was before — `useMapSceneSync` takes
 * the same branch it always took, no style is written to a canvas, no listener
 * hangs off `window`.
 *
 * Set from the URL, `?annotationPlane=off`, in the search string or in the
 * hash query the app routes with, and from the console at runtime:
 * `carmaAnnotationPlane(false)`. The console form re-renders the scenes, so it
 * can be flipped while a drawing is open.
 */

const FLAG = "annotationPlane";
const CONSOLE_NAME = "carmaAnnotationPlane";

const OFF_VALUES = new Set(["off", "0", "false", "no", "nein"]);

const paramOf = (query: string): string | null =>
  query ? new URLSearchParams(query).get(FLAG) : null;

const fromUrl = (): boolean => {
  if (typeof window === "undefined") {
    return true;
  }
  const hash = window.location.hash;
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const value =
    paramOf(hashQuery) ?? paramOf(window.location.search.replace(/^\?/, ""));
  return value === null ? true : !OFF_VALUES.has(value.toLowerCase());
};

let enabled = fromUrl();
const listeners = new Set<() => void>();

export const isPlaneEnabled = () => enabled;

export const setPlaneEnabled = (next: boolean) => {
  if (enabled === next) {
    return enabled;
  }
  enabled = next;
  listeners.forEach((listener) => listener());
  return enabled;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** the console handle, installed once per document */
if (typeof window !== "undefined") {
  const host = window as unknown as Record<string, unknown>;
  host[CONSOLE_NAME] = (next?: boolean) =>
    setPlaneEnabled(next === undefined ? !enabled : next);
}

/** whether the drawing follows bearing and pitch, as a subscribed value */
export const usePlaneEnabled = (): boolean => {
  const getSnapshot = useCallback(() => enabled, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
