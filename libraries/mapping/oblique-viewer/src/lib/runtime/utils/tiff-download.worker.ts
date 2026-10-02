/// <reference lib="webworker" />
import { createTiffDownloadJpeg } from "./tiff-download-jpeg";
import type {
  TiffDownloadRequest,
  TiffDownloadResponse,
} from "./tiff-download-types";

self.onmessage = async (event: MessageEvent<TiffDownloadRequest>) => {
  try {
    const blob = await createTiffDownloadJpeg(
      event.data,
      new AbortController().signal
    );
    self.postMessage({ blob } satisfies TiffDownloadResponse);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    } satisfies TiffDownloadResponse);
  }
};
