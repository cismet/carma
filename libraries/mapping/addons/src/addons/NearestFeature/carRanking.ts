import { fetchCarRoute, type CarRouteSummary } from "@carma-mapping/routing";

import type { IndexedFeatureEntry } from "../../lib/featureIndex";
import { featureKey } from "./featureProperties";

/**
 * Turning the index's straight-line ranking into a ranking by car.
 *
 * `features.json` can only measure as the crow flies, which is what makes it
 * free: no requests, complete over the whole layer. That answer is a good
 * *candidate* set and a poor order, because a river, a motorway or the Wupper
 * valley puts the nearest pharmacy on the map twenty minutes away by car.
 *
 * So the straight-line hits stay the shortlist, and each one of them is routed
 * from the origin, in parallel, once. That is `count` requests per ranking,
 * which is why it is done here and not over the whole layer.
 *
 * A hit the routing service cannot answer for keeps its place at the end of the
 * list rather than dropping out: it is still one of the nearest, it is only
 * unknown how long it takes to get there. If none of them can be routed the
 * straight-line order is kept as it was.
 */

/** what a hit's route is looked up by; the ids `featureProperties` keys on */
export type CarRoutesByFeature = Map<string, CarRouteSummary>;

export type CarRouteRankingResult = {
  /** the same hits, ordered by driving time where it is known */
  entries: IndexedFeatureEntry[];
  routes: CarRoutesByFeature;
};

/** where a hit is routed to: the middle of the box the index knows */
const centerOf = (entry: IndexedFeatureEntry) => ({
  lng: (entry.bbox[0] + entry.bbox[2]) / 2,
  lat: (entry.bbox[1] + entry.bbox[3]) / 2,
});

export const rankByCarRoute = async (
  origin: { lat: number; lng: number },
  entries: IndexedFeatureEntry[]
): Promise<CarRouteRankingResult> => {
  const routes: CarRoutesByFeature = new Map();
  if (entries.length === 0) {
    return { entries, routes };
  }

  const summaries = await Promise.all(
    entries.map((entry) => fetchCarRoute({ from: origin, to: centerOf(entry) }))
  );
  summaries.forEach((summary, index) => {
    if (summary) {
      routes.set(featureKey(entries[index]), summary);
    }
  });

  console.debug("[NEAREST FEATURE] car routes", {
    origin,
    routed: routes.size,
    of: entries.length,
  });

  if (routes.size === 0) {
    return { entries, routes };
  }

  // sorting is stable, so unrouted hits keep their straight-line order among
  // themselves while the routed ones move to the front by driving time
  const ordered = [...entries].sort((a, b) => {
    const routeA = routes.get(featureKey(a));
    const routeB = routes.get(featureKey(b));
    if (!routeA || !routeB) {
      return routeA ? -1 : routeB ? 1 : 0;
    }
    return routeA.durationInSeconds - routeB.durationInSeconds;
  });
  return { entries: ordered, routes };
};
