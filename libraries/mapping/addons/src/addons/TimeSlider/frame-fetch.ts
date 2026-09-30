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

/**
 * Pauses before the second, third and fourth attempt at a frame. Cage gives a
 * frame one call and never asks again, and the time slider only plays once all
 * of them are in, so a WMS hiccup must not cost the frame.
 */
const RETRY_DELAYS_MS = [500, 1500, 3000];

export const FRAME_LOG_PREFIX = "[TIMESLIDER FRAMES]";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** the IEND chunk's type and CRC, the last eight bytes of every whole PNG */
const PNG_END = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const matchesAt = (bytes: Uint8Array, offset: number, expected: number[]) =>
  offset >= 0 &&
  bytes.length >= offset + expected.length &&
  expected.every((byte, index) => bytes[offset + index] === byte);

/**
 * Why a GetMap answer is no frame, or null when it is one. GeoServer reports a
 * failed GetMap as XML under HTTP 200, and a response the http cache kept is
 * served again whatever it holds, so `ok` alone lets a broken frame stick for
 * good. PNG and JPEG are held to their signature, PNG also to its closing
 * chunk, which is what a body cut short lacks; other image types pass on
 * their content type.
 */
const notAFrame = (
  response: Response,
  contentType: string,
  bytes: Uint8Array
): string | null => {
  if (!response.ok) return `HTTP ${response.status}`;
  if (!contentType.toLowerCase().startsWith("image/")) {
    return `content-type ${contentType || "missing"}`;
  }
  if (bytes.length === 0) return "empty body";
  if (matchesAt(bytes, 0, PNG_SIGNATURE)) {
    return matchesAt(bytes, bytes.length - PNG_END.length, PNG_END)
      ? null
      : "PNG cut short";
  }
  if (/jpe?g/i.test(contentType)) {
    return matchesAt(bytes, 0, JPEG_SIGNATURE) ? null : "no JPEG signature";
  }
  return /png/i.test(contentType) ? "no PNG signature" : null;
};

export type FrameCacheOptions = {
  /** see `RETRY_DELAYS_MS`; one attempt more than it has entries */
  retryDelaysMs?: readonly number[];
  /** where a frame given up on is reported. Default: `console.warn` */
  warn?: (...args: unknown[]) => void;
};

const sleep = (ms: number) =>
  ms > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

/**
 * Only the first attempt may be answered from the http cache. Every retry goes
 * to the WMS with `cache: "reload"`, which also overwrites a kept response
 * that turned out not to be a frame, so the next visit does not get it again.
 */
export const createFrameCache = (
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  {
    retryDelaysMs = RETRY_DELAYS_MS,
    warn = (...args) => console.warn(...args),
  }: FrameCacheOptions = {}
): FrameFetch => {
  return async (url) => {
    const key = frameCacheKey(url);
    const attempts = retryDelaysMs.length + 1;
    let lastFailure: {
      reason: string;
      status?: number;
      contentType?: string;
    } = { reason: "not attempted" };

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(retryDelaysMs[attempt - 1] ?? 0);
      try {
        const response = await fetchImpl(key, {
          mode: "cors",
          cache: attempt === 0 ? "force-cache" : "reload",
        });
        const contentType = response.headers.get("content-type") ?? "";
        const bytes = new Uint8Array(await response.arrayBuffer());
        const reason = notAFrame(response, contentType, bytes);
        if (!reason) return new Blob([bytes], { type: contentType });
        lastFailure = { reason, status: response.status, contentType };
      } catch (error) {
        lastFailure = {
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    warn(FRAME_LOG_PREFIX, "frame given up", {
      url: key,
      attempts,
      ...lastFailure,
    });
    throw new Error(`GetMap failed: ${lastFailure.reason}`);
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
