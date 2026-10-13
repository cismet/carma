/** Shared image worker backend for scene adapters and standalone viewports. */
export const createPreviewRgbWorker = () =>
  new Worker(new URL("./preview-rgb.worker.ts", import.meta.url), {
    type: "module",
  });
