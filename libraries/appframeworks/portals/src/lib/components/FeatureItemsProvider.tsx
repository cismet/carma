import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import localforage from "localforage";
import { useLibreContext } from "@carma-mapping/contexts";

/**
 * Feature properties as the vector style sees them. Features of a geojson
 * source that mirror several vector-tile source-layers carry the layer name in
 * `_sourceLayer` (see SOURCE_LAYER_PROPERTY in @carma-mapping/utils).
 */
export interface FeatureItemProperties {
  _sourceLayer?: string;
}

export type FeatureItem<P extends FeatureItemProperties = FeatureItemProperties> =
  GeoJSON.Feature<GeoJSON.Geometry, P>;

export interface FeatureItemsFilterConfig<
  P extends FeatureItemProperties,
  F,
  D
> {
  /** Filter state to start with when nothing is persisted, e.g. all topics selected */
  initial: (dictionary: D) => F;
  /** Client-side predicate, drives filteredItems and everything counted from them */
  matches: (properties: P, state: F) => boolean;
  /** The same filter as a MapLibre expression, for the LibreLayer's userFilter.
   *  Must be equivalent to `matches`. */
  toExpression: (state: F) => unknown[] | null;
}

export interface FeatureItemsConfig<
  P extends FeatureItemProperties,
  F,
  D
> {
  /** Property that identifies an item; several features may share it (polygon + point) */
  idProperty: keyof P & string;
  /** `_sourceLayer` whose feature represents the item when several share an id */
  primaryLayer?: string;
  /** Derived lookup data, e.g. the topic list; what react-cismap called itemsDictionary */
  deriveDictionary: (items: FeatureItem<P>[]) => D;
  filter: FeatureItemsFilterConfig<P, F, D>;
}

export interface FeatureItemsContextValue<
  P extends FeatureItemProperties,
  F,
  D
> {
  /** Everything the map renders, including helper features (points on polygons) */
  collection: GeoJSON.FeatureCollection | null;
  /** One feature per id */
  items: FeatureItem<P>[];
  itemsDictionary: D;
  filterState: F;
  setFilterState: (state: F) => void;
  /** Items matching the current filter */
  filteredItems: FeatureItem<P>[];
  /** Current filter for the map, null until the filter state is initialized */
  filterExpression: unknown[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FeatureItemsContext = createContext<FeatureItemsContextValue<any, any, any> | null>(
  null
);

const persistenceKey = (appKey: string) => `@${appKey}.featureItems.filterState`;

interface FeatureItemsProviderProps<
  P extends FeatureItemProperties,
  F,
  D
> {
  /** Persists the filter state per app, like react-cismap did; omit to not persist */
  appKey?: string;
  collection: GeoJSON.FeatureCollection | null;
  /** Keep this a module constant or memoized; the derived values are memoized on it */
  config: FeatureItemsConfig<P, F, D>;
  children: ReactNode;
}

/**
 * What react-cismap's FeatureCollectionContext held for a topic map, without
 * the Leaflet parts: the loaded features, a dictionary derived from them and
 * the filter state, both as a client-side predicate (for counts and charts)
 * and as a MapLibre expression (for the map).
 */
export function FeatureItemsProvider<
  P extends FeatureItemProperties,
  F,
  D
>({ appKey, collection, config, children }: FeatureItemsProviderProps<P, F, D>) {
  const items = useMemo(() => {
    const byId = new Map<unknown, FeatureItem<P>>();
    for (const feature of (collection?.features ?? []) as FeatureItem<P>[]) {
      const id = feature.properties[config.idProperty];
      const known = byId.get(id);
      const isPrimary =
        !config.primaryLayer ||
        feature.properties._sourceLayer === config.primaryLayer;
      if (!known || isPrimary) {
        byId.set(id, feature);
      }
    }
    return Array.from(byId.values());
  }, [collection, config]);

  const itemsDictionary = useMemo(
    () => config.deriveDictionary(items),
    [items, config]
  );

  const [filterState, setFilterState] = useState<F>(() =>
    config.filter.initial(config.deriveDictionary([]))
  );
  const [initialized, setInitialized] = useState(false);

  // Persisted state is read once; `undefined` means "not read yet", `null`
  // means "nothing stored".
  const [persisted, setPersisted] = useState<F | null | undefined>(
    appKey ? undefined : null
  );
  useEffect(() => {
    if (!appKey) {
      return;
    }
    let cancelled = false;
    localforage
      .getItem<F>(persistenceKey(appKey))
      .then((value) => {
        if (!cancelled) {
          setPersisted(value ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPersisted(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appKey]);

  // Initialize once the data and the persisted state are both known.
  useEffect(() => {
    if (initialized || items.length === 0 || persisted === undefined) {
      return;
    }
    setFilterState(persisted ?? config.filter.initial(itemsDictionary));
    setInitialized(true);
  }, [initialized, items, persisted, itemsDictionary, config]);

  const skipNextPersist = useRef(true);
  useEffect(() => {
    if (!initialized || !appKey) {
      return;
    }
    // the initialization itself must not write the restored value back
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    localforage.setItem(persistenceKey(appKey), filterState).catch((error) => {
      console.warn("[FeatureItems] persisting filter state failed", error);
    });
  }, [initialized, appKey, filterState]);

  const filteredItems = useMemo(
    () => items.filter((item) => config.filter.matches(item.properties, filterState)),
    [items, filterState, config]
  );

  const filterExpression = useMemo(
    () => (initialized ? config.filter.toExpression(filterState) : null),
    [initialized, filterState, config]
  );

  const value = useMemo<FeatureItemsContextValue<P, F, D>>(
    () => ({
      collection,
      items,
      itemsDictionary,
      filterState,
      setFilterState,
      filteredItems,
      filterExpression,
    }),
    [collection, items, itemsDictionary, filterState, filteredItems, filterExpression]
  );

  return (
    <FeatureItemsContext.Provider value={value}>
      {children}
    </FeatureItemsContext.Provider>
  );
}

export function useFeatureItems<
  P extends FeatureItemProperties = FeatureItemProperties,
  F = unknown,
  D = unknown
>(): FeatureItemsContextValue<P, F, D> {
  const value = useContext(FeatureItemsContext);
  if (!value) {
    throw new Error("useFeatureItems must be used below a FeatureItemsProvider");
  }
  return value as FeatureItemsContextValue<P, F, D>;
}

/**
 * Number of distinct items currently rendered in the viewport, what
 * react-cismap called shownFeatures. Counted from rendered features, so it
 * follows zoom-dependent layers and the active filter.
 *
 * @param sourceId source id inside the style; styleBuilder namespaces it as
 *   "<layer name>::<source id>", so the match is on that suffix
 */
export const useShownFeatureCount = (
  sourceId: string,
  idProperty = "id"
): number => {
  const { map } = useLibreContext();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!map) {
      return;
    }
    const update = () => {
      const ids = new Set<unknown>();
      for (const feature of map.queryRenderedFeatures()) {
        if (feature.source.endsWith(`::${sourceId}`)) {
          ids.add(feature.properties?.[idProperty]);
        }
      }
      setCount(ids.size);
    };
    map.on("idle", update);
    update();
    return () => {
      map.off("idle", update);
    };
  }, [map, sourceId, idProperty]);

  return count;
};
