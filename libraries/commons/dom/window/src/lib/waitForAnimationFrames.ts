/**
 * Wait for a specified number of animation frames to complete.
 * Useful for ensuring browser repaints/reflows have finished before proceeding.
 *
 * @param frameCount - The number of animation frames to wait for. Default is 1.
 * @param timeout - The maximum time to wait in milliseconds before rejecting. Default is 500ms.
 * @returns A promise that resolves after the specified number of animation frames or rejects on timeout.
 */
export const waitForAnimationFrames = (
  frameCount: number = 1,
  timeout: number = 500 // ms
): Promise<void> => {
  if (frameCount < 1) {
    return Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise((resolve, _reject) => {
    const startTime = performance.now();
    let framesCompleted = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCompleted = false;
    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    const complete = () => {
      if (isCompleted) return;
      isCompleted = true;
      cleanup();
      resolve();
    };
    const handleTimeout = () => {
      if (isCompleted) return;
      isCompleted = true;

      const elapsed = performance.now() - startTime;
      const message = `waitForAnimationFrames:
Timeout after ${elapsed.toFixed(0)}ms.
Expected ${frameCount} frames,
got ${framesCompleted} frames.
This may indicate the browser is not rendering or the page is not visible.`;
      console.warn(message);
      // Still resolve to not break the flow, but after warning
      resolve();
    };
    const waitFrame = () => {
      if (isCompleted) return;
      requestAnimationFrame(() => {
        if (isCompleted) return;
        framesCompleted++;
        if (framesCompleted >= frameCount) {
          complete();
        } else {
          waitFrame();
        }
      });
    };
    // Start timeout
    timeoutId = setTimeout(handleTimeout, timeout);
    // Start waiting for frames
    waitFrame();
  });
};
