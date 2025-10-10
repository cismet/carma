import { useCarmaTopicMapContext } from "./useCarmaTopicMapContext";

/**
 * Returns whether TopicMap (Leaflet) is currently suspended (i.e., not active/visible).
 * This is the inverse of "is active" - when suspended, TopicMap should not
 * perform updates, render, or respond to user input.
 *
 * @returns true if TopicMap is suspended, false if active
 *
 * @example
 * ```ts
 * const isSuspended = useTopicMapSuspended();
 *
 * if (!isSuspended) {
 *   // Only do TopicMap operations when active
 *   map.flyTo(position);
 * }
 * ```
 */
export const useTopicMapSuspended = (): boolean => {
  const { isSuspendedRef } = useCarmaTopicMapContext();
  return isSuspendedRef.current;
};
