import type { ObliqueDataset } from "../../core/types";
import { summarizeObliquePitchStatistics } from "../../core/utils/imageRecord";
import { loadObliqueSeriesData, type ObliqueData } from "./load-oblique-series";

type CacheLoader = typeof loadObliqueSeriesData;
const CACHE_STARTUP_DEADLINE_MS = 1500;

/** Optional cache modules must not delay the metadata worker's core parser. */
export const loadWithOptionalCatalogCache = async (
  dataset: ObliqueDataset,
  importCache: () => Promise<CacheLoader> = () =>
    import("./oblique-series-cache").then(
      (module) => module.loadCachedObliqueSeriesData
    )
): Promise<ObliqueData> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cachedLoader: CacheLoader | null;
  try {
    cachedLoader = await Promise.race([
      importCache().catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CACHE_STARTUP_DEADLINE_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const data = await (cachedLoader ?? loadObliqueSeriesData)(dataset);
  if (!data.obliquePitchBySeries || !data.obliquePitchByDirectionBySeries) {
    const totals = summarizeObliquePitchStatistics(data);
    data.obliquePitchBySeries ??= totals.obliquePitchBySeries;
    data.obliquePitchByDirectionBySeries ??=
      totals.obliquePitchByDirectionBySeries;
  }
  return data;
};
