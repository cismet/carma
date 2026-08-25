import { promiseWithTimeout } from "@carma-commons/utils";

/**
 * Fade a container in from fully transparent. The reflow between the two opacity
 * writes is what makes the browser treat them as a transition rather than
 * collapsing them into a single style recalculation.
 */
export const fadeInContainer = async (
  container: HTMLElement,
  durationMs: number,
  message?: string
): Promise<void> => {
  if (message) {
    console.debug(message);
  }
  container.style.transition = `opacity ${durationMs}ms ease-in-out`;
  container.style.opacity = "0";
  container.style.pointerEvents = "none";

  void container.offsetHeight;

  container.style.opacity = "1";
  container.style.pointerEvents = "auto";

  await promiseWithTimeout(
    new Promise((resolve) => setTimeout(resolve, durationMs)),
    durationMs + 100
  );
};

export const fadeOutContainer = async (
  container: HTMLElement,
  durationMs: number,
  message?: string
): Promise<void> => {
  if (message) {
    console.debug(message);
  }
  container.style.transition = `opacity ${durationMs}ms ease-in-out`;
  container.style.opacity = "0";
  container.style.pointerEvents = "none";

  await promiseWithTimeout(
    new Promise((resolve) => setTimeout(resolve, durationMs)),
    durationMs + 100
  );
};
