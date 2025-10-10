import { useCesiumContext } from "./useCesiumContext";

/**
 * Returns whether Cesium is currently suspended (i.e., not active/visible).
 * This is the inverse of "is active" - when suspended, Cesium should not
 * perform updates, render, or respond to user input.
 *
 * @returns true if Cesium is suspended, false if active
 *
 * @example
 * ```ts
 * const isSuspended = useCesiumSuspended();
 *
 * if (!isSuspended) {
 *   // Only do Cesium operations when active
 *   camera.flyTo(destination);
 * }
 * ```
 */
export const useCesiumSuspended = (): boolean => {
  const { isSuspendedRef } = useCesiumContext();
  return isSuspendedRef.current;
};
