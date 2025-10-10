/**
 * Utility function to handle delayed and repeated render requests.
 * Supports optional delayed and repeated renders for cases where an appearance
 * change may require one or more follow-up frames in requestRenderMode.
 *
 * Note: The (delay/repeat) options are a temporary workaround for
 * CesiumGS/cesium#12543 and should be deprecated/removed once upstream
 * behavior no longer requires additional nudging.
 */

export type DelayedRenderOptions = {
  delay?: number; // ms
  repeat?: number; // times
  repeatInterval?: number; // ms unset use requestAnimationFrame
  withRequestAnimationFrame?: boolean;
};

export function handleDelayedRender(
  renderFn: () => void,
  opts?: DelayedRenderOptions
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const delay = opts?.delay ?? 0;
    const repeat = Math.max(1, opts?.repeat ?? 1);
    const interval = opts?.repeatInterval;

    if (delay <= 0 && repeat === 1) {
      try {
        renderFn();
        resolve();
      } catch (error) {
        reject(error);
      }
      return;
    }

    const start = () => {
      try {
        renderFn();
        if (repeat > 1) {
          let count = 1;

          if (interval !== undefined) {
            // Use setInterval with specified interval
            const id = window.setInterval(() => {
              try {
                if (count >= repeat) {
                  window.clearInterval(id);
                  resolve();
                  return;
                }
                renderFn();
                count += 1;
              } catch (error) {
                window.clearInterval(id);
                reject(error);
              }
            }, interval);
          } else {
            // Use requestAnimationFrame for smooth repeats
            const repeatWithRAF = () => {
              try {
                if (count >= repeat) {
                  resolve();
                  return;
                }
                renderFn();
                count += 1;
                if (count < repeat) {
                  requestAnimationFrame(repeatWithRAF);
                }
              } catch (error) {
                reject(error);
              }
            };
            requestAnimationFrame(repeatWithRAF);
          }
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    };

    if (delay > 0) {
      window.setTimeout(start, delay);
    } else {
      start();
    }
  });
}

export default handleDelayedRender;
