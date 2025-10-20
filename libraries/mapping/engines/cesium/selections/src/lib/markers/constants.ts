/**
 * Standard marker asset keys used across the application
 */
export const MARKER_KEYS = {
  MARKER_GLOW_LINE: "MarkerGlowLine",
} as const;

/**
 * Type for marker keys
 */
export type MarkerKey = (typeof MARKER_KEYS)[keyof typeof MARKER_KEYS];
