import type { Map as MaplibreMap } from "maplibre-gl";

import type { carma } from "@carma-api";
import type { SelectedFeatureIdentifier } from "@carma-mapping/contexts";
import type { DynamicSearchOption } from "@carma-mapping/fuzzy-search";

import { collectNearestFromIndex } from "../../lib/featureIndex";
import { resolveStackedSources } from "../../lib/stackedSources";
import { rankByCarRoute, type CarRoutesByFeature } from "./carRanking";
import { CATEGORY_SEPARATOR } from "./categoryInput";
import type { NearestFeatureCategory } from "./categoryChannel";
import {
  collectRenderedProperties,
  featureKey,
  pickProperty,
} from "./featureProperties";
import { waitForIdle, waitForStyleLayer } from "./mapReady";

/**
 * Stage 2 of the mode: one sequence, run every time a category's stage is
 * entered.
 *
 * 1. the category's layer is added to the map when it is not on it, because
 *    the ranking reads the tilesets of the sources the style actually has;
 * 2. `collectNearestFromIndex` ranks that layer's `features.json`, which costs
 *    no requests and is complete for the whole layer, on or off screen;
 * 3. `rankByCarRoute` routes those candidates and reorders them by driving
 *    time, so the straight-line ranking only picks who is worth routing;
 * 4. the map is fitted to the origin and every hit, so all of them are drawn;
 * 5. `queryRenderedFeatures` reads the hits' properties off those drawn
 *    features, which is where the names come from.
 *
 * Step 5 is why step 4 exists, and why the names are configured per category:
 * every layer calls its name something else.
 */

export type RankCategoryOptions = {
  map: MaplibreMap;
  carma: typeof carma;
  category: NearestFeatureCategory;
  origin: { lat: number; lng: number };
  count: number;
  /**
   * Route the candidates by car and order them by driving time instead of by
   * straight-line distance; see `carRanking.ts`.
   */
  carRouteRanking: boolean;
  /** select a hit on the map; a row's pick does this and nothing else */
  selectFeature: (id: SelectedFeatureIdentifier) => void;
};

export type RankCategoryResult = {
  rows: DynamicSearchOption[];
  /** why there are no rows, for the row that says so; `null` when there are */
  problem: string | null;
};

const formatDistance = (meters: number): string =>
  meters < 1000
    ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(
        meters
      )} m`
    : `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(
        meters / 1000
      )} km`;

/**
 * A driving time, rounded to whole minutes. Never "0 Min": a hit around the
 * corner takes a moment, and a zero would read as "no route".
 */
const formatDuration = (seconds: number): string => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} Min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} Std` : `${hours} Std ${rest} Min`;
};

/**
 * A row's value is what the input shows and what the dropdown keys on, so two
 * features of the same name have to be told apart.
 */
const uniqueValues = () => {
  const used = new Set<string>();
  return (candidate: string) => {
    let value = candidate;
    let suffix = 2;
    while (used.has(value)) {
      value = `${candidate} (${suffix++})`;
    }
    used.add(value);
    return value;
  };
};

export const rankCategory = async ({
  map,
  carma,
  category,
  origin,
  count,
  carRouteRanking,
  selectFeature,
}: RankCategoryOptions): Promise<RankCategoryResult> => {
  if (!carma.mapping2D.hasLayer(category.layerId)) {
    const added = await carma.mapping2D.addLayer(category.layerId);
    if (!added) {
      console.warn(
        "[NEAREST FEATURE] layer could not be added:",
        category.layerId
      );
      return { rows: [], problem: "Layer konnte nicht geladen werden" };
    }
  }
  const inStyle = await waitForStyleLayer(map, category.layerId);
  if (!inStyle) {
    // it is on the map but not as a vector source: a WMS/WMTS layer draws
    // images, has no tileset and therefore nothing this can rank
    console.warn("[NEAREST FEATURE] layer did not reach the style", {
      layerId: category.layerId,
      stackedSources: resolveStackedSources(map),
    });
    return {
      rows: [],
      problem: "Layer liefert keine Vektordaten (kein Vektor-Layer?)",
    };
  }

  const { entries, statuses } = await collectNearestFromIndex(map, {
    lng: origin.lng,
    lat: origin.lat,
    count,
    filter: {
      carmaLayerIds: [category.layerId],
      ...(category.sourceLayer ? { sourceLayers: [category.sourceLayer] } : {}),
    },
    ...(category.featureIndexUrl ? { indexUrl: category.featureIndexUrl } : {}),
  });
  console.debug("[NEAREST FEATURE]", {
    category: category.label,
    origin,
    statuses,
    entries,
  });
  if (entries.length === 0) {
    return {
      rows: [],
      problem: statuses.some((one) => one.featureCount === null)
        ? "Layer hat keinen Feature-Index (features.json)"
        : "Keine Objekte in diesem Layer",
    };
  }

  // the straight-line hits are the shortlist; the order the user sees is the
  // one the routing service gives them
  const { entries: ranked, routes } = carRouteRanking
    ? await rankByCarRoute(origin, entries)
    : { entries, routes: new Map() as CarRoutesByFeature };

  // fit the origin and every hit, so all of them are drawn and can be read
  // back; the bounding boxes are already in WGS84
  carma.mapping2D.fitBounds(
    Math.min(origin.lng, ...ranked.map((one) => one.bbox[0])),
    Math.min(origin.lat, ...ranked.map((one) => one.bbox[1])),
    Math.max(origin.lng, ...ranked.map((one) => one.bbox[2])),
    Math.max(origin.lat, ...ranked.map((one) => one.bbox[3]))
  );
  await waitForIdle(map);

  const properties = collectRenderedProperties(map, ranked);
  const uniqueValue = uniqueValues();

  const rows = ranked.map((entry) => {
    const key = featureKey(entry);
    const props = properties.get(key);
    const route = routes.get(key);
    const title =
      pickProperty(props, category.labelProperties) ??
      `${category.label} #${String(entry.id)}`;
    const detail = pickProperty(props, category.detailProperties);
    return {
      value: uniqueValue(`${category.label}${CATEGORY_SEPARATOR}${title}`),
      label: title,
      // the category's own icon, so a hit row reads as that kind of place
      ...(category.icon ? { icon: category.icon } : {}),
      ...(detail ? { detail } : {}),
      // what it takes to get there by car; the straight-line distance is what
      // is left when the routing service could not answer for this one
      hint: route
        ? `${formatDuration(route.durationInSeconds)} · ${formatDistance(
            route.distanceInMeters
          )}`
        : formatDistance(entry.distanceInMeters),
      // no `item`: a pick selects the feature on the map and nothing else.
      // Handing a hit to the search's `onSelection` would move the map and
      // drop a gazetteer marker, and the index knows a bounding box, not
      // the position the info box and the marker would need.
      onPick: () =>
        selectFeature({
          source: entry.sourceId,
          sourceLayer: entry.sourceLayer,
          id: entry.id,
        }),
    };
  });

  return { rows, problem: null };
};
