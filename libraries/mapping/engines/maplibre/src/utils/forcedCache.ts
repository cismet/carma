import type { SourceSpecification } from "maplibre-gl";
import { isHttpCacheForced } from "@carma-commons/utils";

let pageForced: boolean | undefined;

/**
 * `cache=forced` for this page (`isHttpCacheForced`), read at the first ask
 * and kept: the map reads it when it is created, and every later request has
 * to follow that answer, not a hash the app may have rewritten since.
 */
export const isPageCacheForced = (): boolean =>
  (pageForced ??= typeof window !== "undefined" && isHttpCacheForced());

/**
 * `fetch` options for the requests the style code makes itself: a vector
 * style's json never passes the map's `transformRequest`, and the geoportal
 * fetches every style of the stack again each time it composes it. Without
 * `cache=forced` no option at all, so such a fetch stays what it was.
 */
export const styleFetchInit = (): RequestInit =>
  isPageCacheForced() ? { cache: "force-cache" } : {};

/**
 * Which requests of the map a style wants served from the browser's http cache
 * whatever their age: a style whose `metadata.carmaConf.cache` is `"forced"`,
 * for data that does not change during a projection show. The map's
 * `transformRequest` asks `isForcedCacheUrl` for every request; the style
 * builder sets the prefixes each time it composes the stack, so a style taken
 * off the map takes its prefixes with it.
 *
 * One set for the page. A second map composing another stack replaces it; the
 * geoportal has one map that composes.
 */
let prefixes: string[] = [];

export const setForcedCachePrefixes = (next: Iterable<string>): void => {
  prefixes = [...new Set(next)].filter((prefix) => prefix.length > 0);
};

export const isForcedCacheUrl = (url: string): boolean =>
  prefixes.some((prefix) => url.startsWith(prefix));

/** whether a style asks for its requests to come from the http cache */
export const styleForcesCache = (style: unknown): boolean =>
  (style as { metadata?: { carmaConf?: { cache?: unknown } } } | null)
    ?.metadata?.carmaConf?.cache === "forced";

/**
 * The url prefixes a source's requests start with: a tile template up to its
 * first placeholder, a TileJSON url's folder (its tiles are expected next to
 * it). A source with inline data makes no request and gives none.
 */
export const sourceUrlPrefixes = (source: SourceSpecification): string[] => {
  const out: string[] = [];
  const { tiles, url } = source as { tiles?: unknown; url?: unknown };
  if (Array.isArray(tiles)) {
    for (const template of tiles) {
      if (typeof template !== "string") continue;
      const brace = template.indexOf("{");
      out.push(brace >= 0 ? template.slice(0, brace) : template);
    }
  }
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    out.push(url.slice(0, url.lastIndexOf("/") + 1));
  }
  return out;
};
