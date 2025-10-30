/**
 * Waits for a specified number of animation frames before resolving.
 * Useful for retry logic that needs to sync with the browser's render cycle.
 *
 * @param frameCount - Number of frames to wait
 * @returns Promise that resolves after the specified number of frames
 *
 * @example
 * // Wait for 3 frames before retrying
 * await waitFrames(3);
 * retry();
 */
export const waitFrames = (frameCount: number): Promise<void> => {
  return new Promise((resolve) => {
    let framesElapsed = 0;
    const tick = () => {
      framesElapsed++;
      if (framesElapsed >= frameCount) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
};
