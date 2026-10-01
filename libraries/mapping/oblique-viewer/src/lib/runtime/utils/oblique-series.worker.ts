/// <reference lib="webworker" />
import { loadCachedObliqueSeriesData } from "./oblique-series-cache";
import type { ObliqueDataset } from "../../core/types";
self.onmessage = async (event: MessageEvent<{ dataset: ObliqueDataset }>) => {
  try {
    self.postMessage({
      data: await loadCachedObliqueSeriesData(event.data.dataset),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Metadaten konnten nicht geladen werden.",
    });
  }
};
