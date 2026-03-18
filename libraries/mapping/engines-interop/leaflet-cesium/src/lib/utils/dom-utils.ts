import { promiseWithTimeout } from "@carma-commons/utils/promise";

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
