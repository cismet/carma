import type { Map as MaplibreMap } from "maplibre-gl";

import type { carma } from "@carma-api";
import type { SelectedFeatureIdentifier } from "@carma-mapping/contexts";
import type { DynamicSearchOption } from "@carma-mapping/fuzzy-search";

import { collectNearestFromIndex } from "../../lib/featureIndex";
import { resolveStackedSources } from "../../lib/stackedSources";
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
 * 3. the map is fitted to the origin and every hit, so all of them are drawn;
 * 4. `queryRenderedFeatures` reads the hits' properties off those drawn
 *    features, which is where the names come from.
 *
 * Step 4 is why step 3 exists, and why the names are configured per category:
 * every layer calls its name something else.
 */

export type RankCategoryOptions = {
  map: MaplibreMap;
  carma: typeof carma;
  category: NearestFeatureCategory;
  origin: { lat: number; lng: number };
  count: number;
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

  // fit the origin and every hit, so all of them are drawn and can be read
  // back; the bounding boxes are already in WGS84
  carma.mapping2D.fitBounds(
    Math.min(origin.lng, ...entries.map((one) => one.bbox[0])),
    Math.min(origin.lat, ...entries.map((one) => one.bbox[1])),
    Math.max(origin.lng, ...entries.map((one) => one.bbox[2])),
    Math.max(origin.lat, ...entries.map((one) => one.bbox[3]))
  );
  await waitForIdle(map);

  const properties = collectRenderedProperties(map, entries);
  const uniqueValue = uniqueValues();

  const rows = entries.map((entry) => {
    const props = properties.get(featureKey(entry));
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
      hint: formatDistance(entry.distanceInMeters),
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
