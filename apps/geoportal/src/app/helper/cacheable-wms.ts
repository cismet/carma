import { isHttpCacheForced } from "@carma-commons/utils";

/** the parts of a WMS request this can replace */
export type WmsRequest = {
  url: string;
  layers: string;
  format?: string;
  transparent?: boolean;
};

const GEOSERVER_CLOUD = "https://geo.udsp.wuppertal.de/geoserver-cloud/wms";

/**
 * The True Orthofoto 2024 from geoserver-cloud. `maps.wuppertal.de/karten`
 * answers GetMap with `Cache-Control: no-cache, no-store`, so none of its tiles
 * ever reaches the http cache and `cache=forced` has nothing to read: on the
 * outlet every return to a scene with the orthophoto fetched all of it again,
 * about 20 s (2026-09-30). geoserver-cloud serves the same layer with
 * `max-age=10800`. A catalog row already comes with this url (its carmaConf
 * source); base maps and the rows made from them name the city's service.
 */
const TRUE_ORTHO_2024: WmsRequest = {
  url: GEOSERVER_CLOUD,
  layers: "GIS-102:trueortho2024",
};

const REPLACEMENTS: Record<string, WmsRequest> = {
  "https://maps.wuppertal.de/karten|R102:trueortho2024": TRUE_ORTHO_2024,
  [`${GEOSERVER_CLOUD}|GIS-102:trueortho2024`]: TRUE_ORTHO_2024,
};

/**
 * Layers that go as JPEG on a page with `cache=forced` (the outlet, pm-show):
 * a 256 px tile of the orthophoto is about 20 kB instead of 200 kB. Only
 * there, because JPEG has no transparency and the orthophoto ends at the city
 * boundary; the model's area lies inside it.
 */
const JPEG_WHEN_CACHE_FORCED = new Set([
  `${GEOSERVER_CLOUD}|GIS-102:trueortho2024`,
]);

const keyOf = (url: string, layers: string) =>
  `${url.replace(/[?&]+$/, "")}|${layers}`;

/**
 * `request` from a service whose tiles the http cache can keep, where one is
 * known for the same layer, and as JPEG where that is lossless enough; else
 * `request` itself.
 */
export const cacheableWms = <T extends WmsRequest>(
  request: T,
  hash?: string
): T => {
  const replacement = REPLACEMENTS[keyOf(request.url, request.layers)];
  const moved = replacement ? { ...request, ...replacement } : request;
  if (
    JPEG_WHEN_CACHE_FORCED.has(keyOf(moved.url, moved.layers)) &&
    isHttpCacheForced(hash)
  ) {
    return { ...moved, format: "image/jpeg", transparent: false };
  }
  return moved;
};
