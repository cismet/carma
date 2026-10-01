/// <reference lib="webworker" />
import { loadObliqueSeriesData } from "./load-oblique-series";
import type { ObliqueDataset } from "../../core/types";
self.onmessage = async (event: MessageEvent<{ dataset: ObliqueDataset }>) => {
  try {
    self.postMessage({ data: await loadObliqueSeriesData(event.data.dataset) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Metadaten konnten nicht geladen werden.",
    });
  }
};
