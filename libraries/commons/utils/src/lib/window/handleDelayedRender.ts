/**
 * Utility function to handle delayed and repeated render requests.
 * Supports optional delayed and repeated renders for cases where an appearance
 * change may require one or more follow-up frames in requestRenderMode.
 *
 * Note: The (delay/repeat) options are a temporary workaround for
 * CesiumGS/cesium#12543 and should be deprecated/removed once upstream
 * behavior no longer requires additional nudging.
 */
export function handleDelayedRender(
  renderFn: () => void,
  opts?: {
    delay?: number; // ms
    repeat?: number; // times
    repeatInterval?: number; // ms - if missing, uses requestAnimationFrame for repeats
  }
): void {
  const delay = opts?.delay ?? 0;
  const repeat = Math.max(1, opts?.repeat ?? 1);
  const interval = opts?.repeatInterval;

  if (delay <= 0 && repeat === 1) {
    renderFn();
    return;
  }

  const start = () => {
    renderFn();
    if (repeat > 1) {
      let count = 1;

      if (interval !== undefined) {
        // Use setInterval with specified interval
        const id = window.setInterval(() => {
          if (count >= repeat) {
            window.clearInterval(id);
            return;
          }
          renderFn();
          count += 1;
        }, interval);
      } else {
        // Use requestAnimationFrame for smooth repeats
        const repeatWithRAF = () => {
          if (count >= repeat) {
            return;
          }
          renderFn();
          count += 1;
          if (count < repeat) {
            requestAnimationFrame(repeatWithRAF);
          }
        };
        requestAnimationFrame(repeatWithRAF);
      }
    }
  };

  if (delay > 0) {
    window.setTimeout(start, delay);
  } else {
    start();
  }
}

export default handleDelayedRender;
