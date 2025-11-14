/**
 * Touch Event Filter
 * Prevents spurious measurement completions caused by invalid touch coordinates
 * during map transitions or container state changes.
 */

export type TouchEventFilter = {
  validTouches: Set<number>;
  lastInvalidTouchTime: number | null;

  /**
   * Check if a touch event has valid coordinates
   */
  isValidTouch(latlng: any): boolean;

  /**
   * Mark a touch as valid and track its ID
   */
  markValidTouch(touchId: number): void;

  /**
   * Mark a touch as invalid and record timestamp
   */
  markInvalidTouch(touchId?: number): void;

  /**
   * Check if a recent invalid touch might have caused a spurious event
   */
  hasRecentInvalidTouch(thresholdMs?: number): boolean;

  /**
   * Check if a specific touch ID is valid
   */
  isTouchValid(touchId: number): boolean;

  /**
   * Clean up a touch ID after processing
   */
  cleanupTouch(touchId: number): void;
};

export function createTouchEventFilter(): TouchEventFilter {
  const validTouches = new Set<number>();
  let lastInvalidTouchTime: number | null = null;

  return {
    validTouches,

    isValidTouch(latlng: any): boolean {
      return latlng && !isNaN(latlng.lat) && !isNaN(latlng.lng);
    },

    markValidTouch(touchId: number): void {
      validTouches.add(touchId);
      console.log(
        "[TouchEventFilter] Valid touchstart, tracking touch ID:",
        touchId
      );
    },

    markInvalidTouch(touchId?: number): void {
      lastInvalidTouchTime = Date.now();
      console.warn(
        "[TouchEventFilter] Invalid touchstart detected (NaN coords), marking for skip"
      );
      if (touchId !== undefined) {
        validTouches.delete(touchId);
      }
    },

    hasRecentInvalidTouch(thresholdMs: number = 50): boolean {
      if (!lastInvalidTouchTime) return false;
      const now = Date.now();
      return now - lastInvalidTouchTime < thresholdMs;
    },

    isTouchValid(touchId: number): boolean {
      return validTouches.has(touchId);
    },

    cleanupTouch(touchId: number): void {
      validTouches.delete(touchId);
    },

    // Expose internal state for debugging
    get lastInvalidTouchTime() {
      return lastInvalidTouchTime;
    },
  };
}
