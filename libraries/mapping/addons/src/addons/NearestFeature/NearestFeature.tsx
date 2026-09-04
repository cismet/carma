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
  DEFAULT_FIT_PADDING,
  DEFAULT_COUNT,
  DEFAULT_ICON,
  DEFAULT_KEY,
  DEFAULT_LABEL,
  DEFAULT_ORIGIN,
  DEFAULT_PLACEHOLDER,
} from "./config";
import { featureKey } from "./featureProperties";
import { clickHit, type PickableHit } from "./pickHit";
import { rankCategory } from "./rankCategory";
import {
  clearRoutes,
  drawRoutes,
  highlightRoute,
  onRouteClick,
  routesAreDrawn,
  type NearestFeatureRoute,
} from "./routeLayer";

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
  /** the driven line of every row that could be routed, to draw on the map */
  routes: NearestFeatureRoute[];
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
 * The routes the ranking drove are drawn on the map with the hits (see
 * `routeLayer.ts`), and the one that leads to the selected feature is the blue
 * one. Selection is the only thing that says which that is, so the two ways to
 * say it meet: picking a row selects the feature and the map paints its route,
 * clicking a route selects the same feature and the row is the selected one.
 *
 * Coming back off a category, by the search's cancel button or by the input
 * being emptied by hand, undoes what the stage put on the map: the routes go
 * and the selection with them (`resetRun`), so picking another category starts
 * from a map that says nothing about the last one.
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
  const { selectFeature, clearSelection, selectedFeatureId } =
    useMapSelection();

  const {
    key = DEFAULT_KEY,
    label = DEFAULT_LABEL,
    icon = DEFAULT_ICON,
    placeholder = DEFAULT_PLACEHOLDER,
    count = DEFAULT_COUNT,
    origin = DEFAULT_ORIGIN,
    preloadIndexes = true,
    carRouteRanking = DEFAULT_CAR_ROUTE_RANKING,
    fitPadding = DEFAULT_FIT_PADDING,
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

  /**
   * The category whose stage is on screen, and the starting point it was last
   * ranked from. A new origin re-ranks against these two rather than against
   * `lastRunRef`, which is dropped the moment a re-rank starts: an origin
   * arriving while one is still running would find nothing there to re-rank and
   * leave the map on the run before it, routes and all.
   */
  const stageCategoryRef = useRef<NearestFeatureCategory | null>(null);
  const rankedOriginKeyRef = useRef<string | null>(null);

  // a category is being ranked, so a starting point is now worth having and
  // worth offering. Asked for when the ranking starts rather than when it is
  // done, because the ranking is what needs the answer: it is also what puts
  // the device's permission prompt on screen at a moment the user understands,
  // right after picking "Apotheken in der Nähe".
  const [wantsOrigin, setWantsOrigin] = useState(false);
  useOriginRequest("nearestFeature", "In der Nähe: Startpunkt", wantsOrigin);

  /**
   * The routes on the map right now. They belong to the run whose rows the
   * dropdown is showing, so they are set where that run is settled on and
   * dropped when the mode is left or the user is back at the category list.
   */
  const [drawnRoutes, setDrawnRoutes] = useState<NearestFeatureRoute[]>([]);

  /** which route is the picked one; the selection is all that says so */
  const selectedRouteKey =
    selectedFeatureId && selectedFeatureId.id != null
      ? featureKey({
          sourceId: selectedFeatureId.source,
          sourceLayer: selectedFeatureId.sourceLayer,
          id: selectedFeatureId.id,
        })
      : null;
  // read by the drawing below, which must not redraw every time the selection
  // moves: repainting the picked line is the highlight's job
  const selectedRouteKeyRef = useRef(selectedRouteKey);
  selectedRouteKeyRef.current = selectedRouteKey;

  /**
   * What picking a hit does, from a row and from its route alike: click it
   * where the map draws it, so the host app shows the info box it shows for
   * any other click on that feature (see `pickHit.ts`). A hit that is not on
   * screen cannot be clicked, and is selected as it was before: highlighted,
   * without an info box, which is better than nothing happening at all.
   */
  const pickHit = useCallback((hit: PickableHit) => {
    const map = mapRef.current;
    if (map && clickHit(map, hit)) {
      return;
    }
    selectFeatureRef.current(hit);
  }, []);

  /**
   * Coming off a category's stage: the routes and whatever was picked in it
   * belong to that stage, so they go with it. Every way back runs this, so they
   * cannot end differently: the cancel button, the input emptied by hand, and
   * the mode being left altogether.
   *
   * Nothing ranked means nothing to undo, which is what keeps entering the mode
   * from clearing a selection the user made somewhere else.
   */
  const resetRun = useCallback(() => {
    if (!stageCategoryRef.current) {
      return;
    }
    stageCategoryRef.current = null;
    rankedOriginKeyRef.current = null;
    lastRunRef.current = null;
    pendingRunRef.current = null;
    setDrawnRoutes([]);
    clearSelectionRef.current();
  }, []);

  /** rank a category from wherever the origin is now, and keep the rows */
  const runRanking = useCallback(
    async (category: NearestFeatureCategory): Promise<Run> => {
      setWantsOrigin(true);
      await awaitOrigin();
      const map = mapRef.current;
      const currentOrigin = originRef.current;
      const originKey = originKeyOf(currentOrigin);
      // this category's stage is the one on screen from here on, ranked from
      // the point that is current now and not from the one the caller set out
      // with: a starting point that arrived while this was waiting is the one
      // that counts, and the effect below then has nothing left to redo
      stageCategoryRef.current = category;
      rankedOriginKeyRef.current = originKey;
      if (!map) {
        // not kept: there is nothing to filter and nothing to re-rank
        return {
          category,
          rows: [],
          routes: [],
          problem: "Keine MapLibre-Karte",
          originKey,
        };
      }
      const { rows, routes, problem } = await rankCategory({
        map,
        carma,
        category,
        origin: currentOrigin,
        count,
        carRouteRanking,
        fitPadding,
        pickHit,
      });
      const run: Run = { category, rows, routes, problem, originKey };
      lastRunRef.current = run;
      return run;
    },
    [awaitOrigin, carma, count, carRouteRanking, fitPadding, pickHit]
  );

  const resolve = useCallback(
    async (input: string): Promise<DynamicSearchGroup[]> => {
      const categories = categoriesRef.current;
      const category = categoryForInput(input, categories);
      if (!category) {
        // back at the category list, by the cancel button or by the input being
        // emptied by hand: either way the stage that was left takes its routes
        // and its pick with it
        resetRun();
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
      // the same run's rows keep the same lines, so a keystroke that only
      // filters them hands back the very array that is drawn and nothing moves
      setDrawnRoutes(run.routes);

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
    [runRanking, resetRun]
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
      resetRun();
    };
  }, [resetRun]);

  /**
   * The run's routes on the map, and back on it after a style rebuild: adding a
   * category's layer replaces the style, which takes the source and the layers
   * with it, and the lines would be gone without a word.
   */
  useEffect(() => {
    if (!libreMap) {
      return;
    }
    if (drawnRoutes.length === 0) {
      clearRoutes(libreMap);
      return;
    }
    const draw = () =>
      drawRoutes(libreMap, drawnRoutes, selectedRouteKeyRef.current);
    draw();
    const redraw = () => {
      if (!routesAreDrawn(libreMap)) {
        draw();
      }
    };
    libreMap.on("styledata", redraw);
    return () => {
      libreMap.off("styledata", redraw);
      clearRoutes(libreMap);
    };
  }, [libreMap, drawnRoutes]);

  /** the picked route is the one that leads to the selected feature */
  useEffect(() => {
    if (libreMap) {
      highlightRoute(libreMap, selectedRouteKey);
    }
  }, [libreMap, selectedRouteKey, drawnRoutes]);

  /**
   * Clicking a route is picking its hit: the same click on the same feature
   * the hit's row makes, so the map and the list say the same thing either way
   * round, info box included.
   */
  useEffect(() => {
    if (!libreMap || drawnRoutes.length === 0) {
      return;
    }
    return onRouteClick(libreMap, (key) => {
      const route = drawnRoutes.find((one) => one.key === key);
      if (route) {
        pickHit(route.hit);
      }
    });
  }, [libreMap, drawnRoutes, pickHit]);

  /**
   * A new starting point re-ranks the category that is on screen, whether or
   * not the dropdown is open: picking an address in the origin search moves the
   * focus there, so waiting for the search to ask again would leave the map
   * fitted around the old point. The ranking runs here, and the search is only
   * told afterwards, through the rerun above.
   *
   * What was drawn and picked before belongs to the old starting point, so the
   * routes and the selection go first: the map ends up on the category's stage
   * again, fitted around the new point, with the fresh hits in the dropdown.
   *
   * It re-ranks against the stage's own refs, not against the run: a starting
   * point can change twice in a row (clearing the origin search hands back the
   * user's own position), and the second change must still find a stage to
   * re-rank while the first one's ranking is in flight.
   */
  const originKey = originKeyOf(effectiveOrigin);
  useEffect(() => {
    const category = stageCategoryRef.current;
    // no stage on screen, or it is already ranked from exactly this point: the
    // origin search publishing its default on mount must not re-rank and move
    // the map
    if (!category || rankedOriginKeyRef.current === originKey) {
      return;
    }
    lastRunRef.current = null;
    pendingRunRef.current = null;
    // the lines were driven from a point that is not the starting point any
    // more, so they go now rather than when their replacements arrive: a
    // ranking takes seconds, and a route from nowhere is worse than none
    setDrawnRoutes([]);
    clearSelectionRef.current();
    let cancelled = false;
    void (async () => {
      const run = await runRanking(category);
      // another origin arrived while this one was ranking, or the stage was
      // left altogether: that run owns the map and the rows now, or nothing
      // does and the input is not to be written back into
      if (cancelled || stageCategoryRef.current !== category) {
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
