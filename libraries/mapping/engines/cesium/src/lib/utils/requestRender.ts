import type { MutableRefObject } from "react";
import type { Viewer } from "cesium";
import { cesiumSafeRequestRender } from "./cesiumHelpers";

/**
 * Factory that returns a requestRender callback bound to a specific viewerRef.
 *
 * Supports optional delayed and repeated renders for cases where an appearance
 * change may require one or more follow-up frames in requestRenderMode.
 *
 * Note: The (delay/repeat) options are a temporary workaround for
 * CesiumGS/cesium#12543 and should be deprecated/removed once upstream
 * behavior no longer requires additional nudging.
 */
export function createRequestRender(
  viewerRef: MutableRefObject<Viewer | null>
): (opts?: {
  delay?: number; // ms
  repeat?: number; // times
  repeatInterval?: number; // ms
}) => void {
  // store last identity on a WeakMap keyed by the ref object to avoid leaking
  const lastIdentity = new WeakMap<object, unknown>();

  const runOnce = () => {
    const current = viewerRef.current as unknown;
    const last = lastIdentity.get(viewerRef) ?? null;
    cesiumSafeRequestRender(current, (last as unknown) ?? current);
    lastIdentity.set(viewerRef, current ?? null);
  };

  return (opts) => {
    const delay = opts?.delay ?? 0;
    const repeat = Math.max(1, opts?.repeat ?? 1);
    const interval = opts?.repeatInterval ?? 100;

    if (delay <= 0 && repeat === 1) {
      runOnce();
      return;
    }

    const start = () => {
      runOnce();
      if (repeat > 1) {
        let count = 1;
        const id = window.setInterval(() => {
          if (count >= repeat) {
            window.clearInterval(id);
            return;
          }
          runOnce();
          count += 1;
        }, interval);
      }
    };

    if (delay > 0) {
      window.setTimeout(start, delay);
    } else {
      start();
    }
  };
}
