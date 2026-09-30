/**
 * The crossfade's frames from the browser's http cache, for a map opened with
 * `cache=forced` (see `isHttpCacheForced`): the outlet and pm-show come back to
 * a scene with the same camera, so its series asks the WMS for the same
 * full-view images, one per time step, every time the scene is shown.
 *
 * The Starkregen WMS sends no caching headers, so a plain request never reuses
 * what the browser has kept. `cache: "force-cache"` takes a kept response
 * whatever its age, which is right for a simulated time step: it does not
 * change under its url. Nothing refreshes while the switch is on; emptying the
 * browser's cache (carmaPM has a button for its outlet) is how a new one gets
 * in.
 */

/**
 * Decimal places the bbox is rounded to in the request, in the metres of
 * EPSG:3857: a centimetre. A camera that comes back to a view lands on it to
 * within float noise, which is a different url and would miss the http cache.
 * A frame a centimetre off still sits right on the map.
 */
const BBOX_DECIMALS = 2;

const METRIC_SRS = new Set(["EPSG:3857", "EPSG:900913"]);

/** a query parameter by name, whatever its case (`bbox` or `BBOX`) */
const paramKey = (params: URLSearchParams, name: string): string | null => {
  for (const key of params.keys()) {
    if (key.toLowerCase() === name) return key;
  }
  return null;
};

/** the url with its bbox rounded, see `BBOX_DECIMALS`; geographic ones as they are */
export const frameCacheKey = (url: string): string => {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const srsKey = paramKey(params, "srs") ?? paramKey(params, "crs");
    const bboxKey = paramKey(params, "bbox");
    if (!srsKey || !bboxKey) return url;
    if (!METRIC_SRS.has((params.get(srsKey) ?? "").toUpperCase())) return url;
    const rounded = (params.get(bboxKey) ?? "")
      .split(",")
      .map((value) => Number(value).toFixed(BBOX_DECIMALS));
    if (rounded.length !== 4 || rounded.some((value) => value === "NaN")) {
      return url;
    }
    params.set(bboxKey, rounded.join(","));
    return parsed.toString();
  } catch {
    return url;
  }
};

/** the image behind a GetMap url, the shape cage's blend layer takes as `fetchFrame` */
export type FrameFetch = (url: string) => Promise<Blob>;

export const createFrameCache = (
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init)
): FrameFetch => {
  return async (url) => {
    const response = await fetchImpl(frameCacheKey(url), {
      mode: "cors",
      cache: "force-cache",
    });
    if (!response.ok) throw new Error(`GetMap HTTP ${response.status}`);
    return response.blob();
  };
};

let shared: FrameFetch | null = null;

/**
 * The same reference on every call, so handing it to the engine never counts
 * as a changed option.
 */
export const getSharedFrameCache = (): FrameFetch => {
  shared ??= createFrameCache();
  return shared;
};
