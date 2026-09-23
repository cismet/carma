/**
 * The flow field's u/v rasters from the browser's http cache, for a map opened
 * with `cache=forced` (see `isHttpCacheForced`): the outlet and pm-show switch
 * between scenes with fixed cameras, so every scene asks rasterfari for the
 * same two rasters each time it comes back, about 50 MB each for the
 * projection area.
 *
 * rasterfari sends no caching headers, so a plain request never reuses what
 * the browser has kept. `cache: "force-cache"` takes a kept response whatever
 * its age, which is right for a scenario's raster: it does not change under
 * its url. Nothing refreshes while the switch is on; emptying the browser's
 * cache (carmaPM has a button for its outlet) is how a new one is fetched.
 */

/**
 * Decimal places the view box is rounded to in the request: 1e-5 degrees,
 * about a metre. A camera that comes back to a view lands on it to within
 * float noise (7.150799999998981 for 7.1508), which is a different url and
 * would miss the http cache. A raster carries its own georeference, so one
 * fetched for a box a metre off still sits right.
 */
const BBOX_DECIMALS = 5;

/** the url with its `BBOX` rounded, see `BBOX_DECIMALS` */
export const rasterCacheKey = (url: string): string => {
  try {
    const parsed = new URL(url);
    const bbox = parsed.searchParams.get("BBOX");
    if (!bbox) return url;
    const rounded = bbox
      .split(",")
      .map((value) => Number(value).toFixed(BBOX_DECIMALS));
    if (rounded.some((value) => value === "NaN")) return url;
    parsed.searchParams.set("BBOX", rounded.join(","));
    return parsed.toString();
  } catch {
    return url;
  }
};

/** the bytes behind a url, the shape cage's flow layer takes as `fetchBuffer` */
export type RasterFetch = (
  url: string,
  signal?: AbortSignal
) => Promise<ArrayBuffer>;

export const createRasterCache = (
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init)
): RasterFetch => {
  return async (url, signal) => {
    const response = await fetchImpl(rasterCacheKey(url), {
      signal,
      cache: "force-cache",
    });
    if (!response.ok) throw new Error(`gdalProcessor HTTP ${response.status}`);
    return response.arrayBuffer();
  };
};

let shared: RasterFetch | null = null;

/**
 * The same reference on every call, so handing it to the engine never counts
 * as a changed option.
 */
export const getSharedRasterCache = (): RasterFetch => {
  shared ??= createRasterCache();
  return shared;
};
