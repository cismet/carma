import { useCallback, useEffect, useMemo, useRef } from "react";

import { useMapSelection } from "@carma-mapping/contexts";
import type {
  DynamicSearchGroup,
  DynamicSearchOption,
} from "@carma-mapping/fuzzy-search";

import { useAddonState } from "../../lib/AddonStateContext";
import { primeFeatureIndexes } from "../../lib/featureIndex";
import type { AddonComponentProps } from "../../lib/registry";
import type { NearestFeatureCategory } from "./categoryChannel";
import {
  categoryForInput,
  categoryGroup,
  categoryInputValue,
  queryForCategory,
} from "./categoryInput";
import {
  DEFAULT_COUNT,
  DEFAULT_ICON,
  DEFAULT_KEY,
  DEFAULT_LABEL,
  DEFAULT_ORIGIN,
  DEFAULT_PLACEHOLDER,
} from "./config";
import { rankCategory } from "./rankCategory";

/**
 * "In der Nähe": the nearest-feature ranking as a mode of the gazetteer search.
 *
 * The mode has two stages, like the land-parcel search. The first lists the
 * categories the route's category addons published on the
 * `nearestFeatureCategories` channel ("Apotheken", see `categoryChannel.ts`);
 * the mode itself declares none. Picking one drills down and the second
 * lists the `count` nearest features of that category, each with its distance.
 * Picking a result selects that feature on the map through
 * `MapSelectionContext` and does nothing else: the map has already been moved
 * so every hit is visible, and the index knows a bounding box rather than the
 * position a gazetteer marker would be dropped at.
 *
 * Entering a category's stage runs `rankCategory` (see there for the sequence),
 * every time; nothing is kept between searches. Only the rows of the run that
 * just happened are held on to, so typing a filter behind the category does not
 * re-rank and re-fit the map on every keystroke.
 *
 * The origin is the app's home view for now; a real position (the device, the
 * map centre, a pinned point) replaces one config value.
 *
 * MapLibre only: without a MapLibre map the mode is not registered at all.
 */
export const NearestFeature = ({
  config,
  carma,
  libreMap,
}: AddonComponentProps<"nearestFeature">) => {
  // the geoportal's programmatic selection channel, the same one a result list
  // uses; outside a provider this is an inert default
  const { selectFeature } = useMapSelection();

  const {
    key = DEFAULT_KEY,
    label = DEFAULT_LABEL,
    icon = DEFAULT_ICON,
    placeholder = DEFAULT_PLACEHOLDER,
    count = DEFAULT_COUNT,
    origin = DEFAULT_ORIGIN,
    preloadIndexes = true,
  } = config ?? {};

  // the mode is registered once and then asked for years of keystrokes, so
  // what changes underneath it is read through refs rather than through the
  // closure, which would re-register the mode and reload the gazetteer
  const mapRef = useRef(libreMap);
  mapRef.current = libreMap;
  const selectFeatureRef = useRef(selectFeature);
  selectFeatureRef.current = selectFeature;

  // the categories the route's category addons published, read through a ref
  // for the same reason: one mounting later must not re-register the mode
  const [publishedCategories] = useAddonState("nearestFeatureCategories");
  const categoriesRef = useRef<NearestFeatureCategory[]>([]);
  categoriesRef.current = Object.values(publishedCategories ?? {});

  /**
   * The rows of the run that just happened, not a cache: entering a category's
   * stage always searches again. This only survives the keystrokes that filter
   * that result, so typing does not re-rank and move the map per character.
   */
  const lastRunRef = useRef<{
    category: string;
    rows: DynamicSearchOption[];
    /** why it produced nothing, for the row that says so */
    problem: string | null;
  } | null>(null);

  const resolve = useCallback(
    async (input: string): Promise<DynamicSearchGroup[]> => {
      const categories = categoriesRef.current;
      const category = categoryForInput(input, categories);
      if (!category) {
        return [categoryGroup(input, categories)];
      }

      const map = mapRef.current;
      const query = (queryForCategory(input, category) ?? "").toLowerCase();
      const lastRun = lastRunRef.current;
      // an empty query is the stage being entered, which always searches again;
      // a query only reuses the rows of the run it is filtering
      const isFilteringLastRun =
        query !== "" && lastRun?.category === category.label;
      let rows: DynamicSearchOption[];
      let problem: string | null;
      if (isFilteringLastRun && lastRun) {
        ({ rows, problem } = lastRun);
      } else if (!map) {
        rows = [];
        problem = "Keine MapLibre-Karte";
      } else {
        ({ rows, problem } = await rankCategory({
          map,
          carma,
          category,
          origin,
          count,
          selectFeature: (id) => selectFeatureRef.current(id),
        }));
        lastRunRef.current = { category: category.label, rows, problem };
      }

      const filtered =
        query === ""
          ? rows
          : rows.filter((row) =>
              `${row.label ?? ""} ${row.detail ?? ""}`
                .toLowerCase()
                .includes(query)
            );

      const title = `${category.label} in der Nähe`;
      if (filtered.length === 0) {
        return [
          {
            title,
            // inert: picking it just asks the stage again
            options: [
              {
                value: categoryInputValue(category),
                label:
                  rows.length === 0
                    ? problem ?? "Keine Treffer für diesen Layer"
                    : "Keine Treffer für diese Eingabe",
                ...(rows.length === 0
                  ? { detail: "Auswählen versucht es erneut" }
                  : {}),
                drilldown: true,
              },
            ],
          },
        ];
      }
      return [{ title, options: filtered }];
    },
    [carma, count, origin]
  );

  // fetch the indexes as soon as their sources are in the style, so a search
  // has nothing left to fetch. `styledata` fires constantly; priming is a no-op
  // while the set of sources is unchanged, and each index is fetched once for
  // the whole session, so the repeated calls cost nothing.
  useEffect(() => {
    if (!libreMap || !preloadIndexes) {
      return;
    }
    const prime = () => primeFeatureIndexes(libreMap);
    prime();
    libreMap.on("styledata", prime);
    return () => {
      libreMap.off("styledata", prime);
    };
  }, [libreMap, preloadIndexes]);

  const mode = useMemo(
    () => ({ key, label, icon, placeholder, resolve }),
    [key, label, icon, placeholder, resolve]
  );

  useEffect(() => {
    if (!libreMap) {
      return;
    }
    return carma.gazetteer.addMode(mode);
  }, [carma, libreMap, mode]);

  return null;
};
