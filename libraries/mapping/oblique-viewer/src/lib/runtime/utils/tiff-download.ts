import type {
  TiffDownloadRequest,
  TiffDownloadResponse,
} from "./tiff-download-types";

let active = false;

/** A single short-lived worker owns all native raster and canvas allocations. */
export const downloadTiffJpeg = (
  request: TiffDownloadRequest,
  signal?: AbortSignal
): Promise<Blob> => {
  if (active)
    return Promise.reject(
      new Error("Ein JPG-Download wird bereits vorbereitet.")
    );
  if (signal?.aborted)
    return Promise.reject(
      signal.reason ?? new DOMException("Download abgebrochen", "AbortError")
    );
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined")
    return Promise.reject(
      new Error("Dieser Browser unterstützt den JPG-Download nicht.")
    );

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./tiff-download.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (error) {
      reject(error);
      return;
    }
    active = true;
    let settled = false;
    const finish = (error?: unknown, blob?: Blob) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      active = false;
      if (error) reject(error);
      else resolve(blob!);
    };
    const abort = () =>
      finish(
        signal?.reason ?? new DOMException("Download abgebrochen", "AbortError")
      );
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "Der JPG-Download konnte nicht rechtzeitig vorbereitet werden."
          )
        ),
      5 * 60 * 1000
    );
    worker.onmessage = (event: MessageEvent<TiffDownloadResponse>) => {
      if (event.data.error) finish(new Error(event.data.error));
      else if (event.data.blob?.type === "image/jpeg" && event.data.blob.size)
        finish(undefined, event.data.blob);
      else finish(new Error("Der JPG-Download lieferte kein gültiges Bild."));
    };
    worker.onerror = () =>
      finish(
        new Error("Das Originalbild konnte nicht als JPG vorbereitet werden.")
      );
    worker.onmessageerror = () =>
      finish(new Error("Das vorbereitete JPG konnte nicht übertragen werden."));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(request);
    } catch (error) {
      finish(error);
    }
  });
};
