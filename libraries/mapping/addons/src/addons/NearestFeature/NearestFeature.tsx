import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMapSelection } from "@carma-mapping/contexts";
import type {
  DynamicModeRerun,
  DynamicSearchGroup,
  DynamicSearchOption,
} from "@carma-mapping/fuzzy-search";

import { useAddonState } from "../../lib/AddonStateContext";
import { primeFeatureIndexes } from "../../lib/featureIndex";
import type { AddonComponentProps } from "../../lib/registry";
import { useOriginLocationState, useOriginRequest } from "../OriginSearch";
import type { NearestFeatureCategory } from "./categoryChannel";
import {
  categoryForInput,
  categoryGroup,
  categoryInputValue,
  categoryPrefix,
  queryForCategory,
} from "./categoryInput";
import {
  DEFAULT_CAR_ROUTE_RANKING,
  DEFAULT_COUNT,
  DEFAULT_ICON,
  DEFAULT_KEY,
  DEFAULT_LABEL,
  DEFAULT_ORIGIN,
  DEFAULT_PLACEHOLDER,
} from "./config";
import { rankCategory } from "./rankCategory";

/** how long a ranking waits for the origin search before it gives up on it */
const ORIGIN_WAIT_TIMEOUT = 15000;

/** identity of a starting point, for "were these rows ranked from here?" */
const originKeyOf = (origin: { lat: number; lng: number }) =>
  `${origin.lat},${origin.lng}`;

/**
 * One ranking of one category. Not a cache: entering a category's stage always
 * searches again. It survives the keystrokes that filter that result, so typing
 * does not re-rank and move the map per character, and it says which category
 * and which starting point it belongs to, so a run from somewhere else is not
 * mistaken for one of those keystrokes.
 */
type Run = {
  category: NearestFeatureCategory;
  rows: DynamicSearchOption[];
  /** why it produced nothing, for the row that says so */
  problem: string | null;
  /** where it was ranked from; another origin makes those rows stale */
  originKey: string;
};

/**
 * "In der Nähe": the nearest-feature ranking as a mode of the gazetteer search.
 *
 * The mode has two stages, like the land-parcel search. The first lists the
 * categories the route's category addons published on the
 * `nearestFeatureCategories` channel ("Apotheken", see `categoryChannel.ts`);
 * the mode itself declares none. Picking one drills down and the second
 * lists the `count` nearest features of that category, each with what it takes
 * to drive there: the straight-line ranking only picks the candidates, the
 * routing service puts them in order (see `carRanking.ts`).
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
 * "Nearby" is measured from the `originLocation` channel, which the
 * `originSearch` addon writes: once a category has been ranked the mode asks
 * for that input to be shown, and picking a starting point there re-ranks the
 * category on screen through `subscribe`. Without that addon the channel stays
 * empty and the configured `origin` is used, as before.
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
  const { selectFeature, clearSelection } = useMapSelection();

  const {
    key = DEFAULT_KEY,
    label = DEFAULT_LABEL,
    icon = DEFAULT_ICON,
    placeholder = DEFAULT_PLACEHOLDER,
    count = DEFAULT_COUNT,
    origin = DEFAULT_ORIGIN,
    preloadIndexes = true,
    carRouteRanking = DEFAULT_CAR_ROUTE_RANKING,
  } = config ?? {};

  // the mode is registered once and then asked for years of keystrokes, so
  // what changes underneath it is read through refs rather than through the
  // closure, which would re-register the mode and reload the gazetteer
  const mapRef = useRef(libreMap);
  mapRef.current = libreMap;
  const selectFeatureRef = useRef(selectFeature);
  selectFeatureRef.current = selectFeature;
  const clearSelectionRef = useRef(clearSelection);
  clearSelectionRef.current = clearSelection;

  // the categories the route's category addons published, read through a ref
  // for the same reason: one mounting later must not re-register the mode
  const [publishedCategories] = useAddonState("nearestFeatureCategories");
  const categoriesRef = useRef<NearestFeatureCategory[]>([]);
  categoriesRef.current = Object.values(publishedCategories ?? {});

  // the starting point, read the same way and for the same reason: the origin
  // search publishing another one must not re-register the mode, which would
  // refetch the whole gazetteer
  const { origin: publishedOrigin, resolution } = useOriginLocationState();
  const effectiveOrigin = publishedOrigin ?? origin;
  const originRef = useRef(effectiveOrigin);
  originRef.current = effectiveOrigin;

  /**
   * Ranking waits while the origin search is still working out where the user
   * starts. Without it the first ranking runs from the configured fallback and
   * the real origin re-ranks it a moment later, so the map flies to one point
   * and back, and the same category is searched twice.
   *
   * The waiters are resolved from an effect rather than by polling, and again
   * when the mode unmounts, so nothing is left waiting on an answer that is not
   * coming any more.
   */
  const resolutionRef = useRef(resolution);
  resolutionRef.current = resolution;
  const originWaitersRef = useRef<Array<() => void>>([]);
  const releaseOriginWaiters = () => {
    originWaitersRef.current.splice(0).forEach((resolve) => resolve());
  };
  useEffect(() => {
    if (resolution !== "pending") {
      releaseOriginWaiters();
    }
  }, [resolution]);
  useEffect(() => releaseOriginWaiters, []);
  const awaitOrigin = useCallback(
    () =>
      resolutionRef.current === "pending"
        ? new Promise<void>((resolve) => {
            originWaitersRef.current.push(resolve);
            // a backstop, not the normal path: the device's own timeout is ten
            // seconds, so an answer that has not come by now is not coming, and
            // a search that hangs on it is worse than one from the fallback
            setTimeout(resolve, ORIGIN_WAIT_TIMEOUT);
          })
        : Promise.resolve(),
    []
  );

  /** the run that just happened; see `Run` */
  const lastRunRef = useRef<Run | null>(null);

  /**
   * A run the origin change already did, waiting for the search to ask. Without
   * it the rerun below would rank the very same category a second time, because
   * entering a stage always searches again.
   */
  const pendingRunRef = useRef<Run | null>(null);

  // a category is being ranked, so a starting point is now worth having and
  // worth offering. Asked for when the ranking starts rather than when it is
  // done, because the ranking is what needs the answer: it is also what puts
  // the device's permission prompt on screen at a moment the user understands,
  // right after picking "Apotheken in der Nähe".
  const [wantsOrigin, setWantsOrigin] = useState(false);
  useOriginRequest("nearestFeature", "In der Nähe: Startpunkt", wantsOrigin);

  /** rank a category from wherever the origin is now, and keep the rows */
  const runRanking = useCallback(
    async (category: NearestFeatureCategory): Promise<Run> => {
      setWantsOrigin(true);
      await awaitOrigin();
      const map = mapRef.current;
      const currentOrigin = originRef.current;
      const originKey = originKeyOf(currentOrigin);
      if (!map) {
        // not kept: there is nothing to filter and nothing to re-rank
        return {
          category,
          rows: [],
          problem: "Keine MapLibre-Karte",
          originKey,
        };
      }
      const { rows, problem } = await rankCategory({
        map,
        carma,
        category,
        origin: currentOrigin,
        count,
        carRouteRanking,
        selectFeature: (id) => selectFeatureRef.current(id),
      });
      const run: Run = { category, rows, problem, originKey };
      lastRunRef.current = run;
      return run;
    },
    [awaitOrigin, carma, count, carRouteRanking]
  );

  const resolve = useCallback(
    async (input: string): Promise<DynamicSearchGroup[]> => {
      const categories = categoriesRef.current;
      const category = categoryForInput(input, categories);
      if (!category) {
        return [categoryGroup(input, categories)];
      }

      const query = (queryForCategory(input, category) ?? "").toLowerCase();
      const lastRun = lastRunRef.current;
      const pendingRun = pendingRunRef.current;
      const originKey = originKeyOf(originRef.current);
      // the run a new origin already did for this category: take it rather than
      // rank the same thing again
      const isPendingRun =
        pendingRun?.category.key === category.key &&
        pendingRun.originKey === originKey;
      // an empty query is the stage being entered, which always searches again;
      // a query only reuses the rows of the run it is filtering, and only while
      // they were ranked from the origin that is current now
      const isFilteringLastRun =
        query !== "" &&
        lastRun?.category.key === category.key &&
        lastRun.originKey === originKey;

      let run: Run;
      if (isPendingRun && pendingRun) {
        pendingRunRef.current = null;
        run = pendingRun;
      } else if (isFilteringLastRun && lastRun) {
        run = lastRun;
      } else {
        run = await runRanking(category);
      }
      const { rows, problem } = run;

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
    [runRanking]
  );

  /**
   * The search pulls, so a new origin cannot push rows into it. The mode hands
   * the search a rerun callback instead, which it calls once it has ranked the
   * category again, so an open dropdown picks the fresh rows up. The callback
   * is kept in a ref so `subscribe` stays the same function and the mode is
   * never re-registered.
   */
  const rerunRef = useRef<DynamicModeRerun | null>(null);
  const subscribe = useCallback((rerun: DynamicModeRerun) => {
    rerunRef.current = rerun;
    return () => {
      if (rerunRef.current === rerun) {
        rerunRef.current = null;
      }
      setWantsOrigin(false);
      lastRunRef.current = null;
      pendingRunRef.current = null;
    };
  }, []);

  /**
   * A new starting point re-ranks the category that is on screen, whether or
   * not the dropdown is open: picking an address in the origin search moves the
   * focus there, so waiting for the search to ask again would leave the map
   * fitted around the old point. The ranking runs here, and the search is only
   * told afterwards, through the rerun above.
   *
   * What was picked before belongs to the old starting point, so the selection
   * goes first: the map ends up on the category's stage again, fitted around
   * the new point, with the fresh hits in the dropdown.
   */
  const originKey = originKeyOf(effectiveOrigin);
  useEffect(() => {
    const lastRun = lastRunRef.current;
    // nothing ranked yet, or ranked from exactly this point: the origin search
    // publishing its default on mount must not re-rank and move the map
    if (!lastRun || lastRun.originKey === originKey) {
      return;
    }
    const { category } = lastRun;
    lastRunRef.current = null;
    pendingRunRef.current = null;
    clearSelectionRef.current();
    let cancelled = false;
    void (async () => {
      const run = await runRanking(category);
      // another origin arrived while this one was ranking: that run owns the
      // map and the rows now
      if (cancelled) {
        return;
      }
      pendingRunRef.current = run;
      // back to the category itself, off whatever hit was picked in it, and
      // show the new ones rather than leave the user to open the dropdown
      rerunRef.current?.({ input: categoryInputValue(category), open: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [originKey, runRanking]);

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

  const inputPrefixOf = useCallback((input: string) => {
    const category = categoryForInput(input, categoriesRef.current);
    if (!category || input !== input.trimStart()) {
      return null;
    }
    const withSeparator = categoryInputValue(category);
    const length = input.startsWith(withSeparator)
      ? withSeparator.length
      : categoryPrefix(category).length;
    return input.slice(0, length);
  }, []);

  const mode = useMemo(
    () => ({
      key,
      label,
      icon,
      placeholder,
      resolve,
      subscribe,
      inputPrefixOf,
    }),
    [key, label, icon, placeholder, resolve, subscribe, inputPrefixOf]
  );

  useEffect(() => {
    if (!libreMap) {
      return;
    }
    return carma.gazetteer.addMode(mode);
  }, [carma, libreMap, mode]);

  return null;
};
