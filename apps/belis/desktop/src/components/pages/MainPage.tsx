import { useEffect, useMemo, useState } from "react";
import BelisMapLibWrapper from "../commons/BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { CustomCard } from "../commons/CustomCard";
import { useWindowSize } from "@react-hook/window-size";
import { BelisSwitch } from "@carma-appframeworks/belis";
import { AppDispatch } from "../../store";
import {
  useDatasheet,
  useLibreContext,
  useMapHighlight,
  useLayerFilter,
} from "@carma-mapping/engines/maplibre";
import {
  isInPaleMode,
  setPaleModeActive,
} from "../../store/slices/mapSettings";
import { getJWT } from "../../store/slices/auth";
import { ENDPOINT } from "../../constants/belis";
import { getFromUTM32ToWGS84 } from "@carma/geo/proj";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { message, Spin, Switch } from "antd";
import {
  getKeyTablesLoading,
  getKeyTablesFetched,
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
} from "../../store/slices/keyTables";
interface BelisStreet {
  s: string;
  g: string;
  x: number;
  y: number;
  m: {
    s: string;
    id?: string;
    bounds: [number, number, number, number];
  };
}
import { fetchAllKeyTables } from "../../helper/apiMethods";
import localForage from "localforage";
import SearchModal from "../ui/SearchModal";
import StreetSearch from "../ui/StreetSearch";

const FILTER_STORAGE_KEY = "@belis-desktop.layerFilter";

const MainPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const inPaleMode = useSelector(isInPaleMode);
  const jwt = useSelector(getJWT);
  const keyTablesLoading = useSelector(getKeyTablesLoading);
  const keyTablesFetched = useSelector(getKeyTablesFetched);
  const [streets, setStreets] = useState<BelisStreet[]>([]);

  const { map } = useLibreContext();

  // Fetch key tables on mount if not already fetched
  useEffect(() => {
    if (keyTablesFetched) return;

    const fetchData = async () => {
      if (!jwt) return;

      dispatch(setKeyTablesLoading(true));
      try {
        const { data, errors } = await fetchAllKeyTables(jwt);
        dispatch(setKeyTablesData(data));
        dispatch(setKeyTablesErrors(errors));
        if (Object.keys(errors).length > 0) {
          message.error(
            "Einige Schlüsseltabellen konnten nicht geladen werden"
          );
        }
      } catch (error) {
        console.error("Failed to fetch key tables:", error);
      } finally {
        dispatch(setKeyTablesLoading(false));
      }
    };
    fetchData();
  }, [jwt, keyTablesFetched, dispatch]);

  // Fetch streets data on mount
  useEffect(() => {
    if (streets.length > 0) return;

    dispatch(setKeyTablesLoading(true));
    fetch("https://wunda-geoportal.cismet.de/data/3857/belisStrassen.json")
      .then((res) => res.json())
      .then((data) => setStreets(data))
      .catch((error) => console.error("Failed to fetch streets:", error))
      .finally(() => dispatch(setKeyTablesLoading(false)));
  }, []);

  const gazData = useMemo(
    () =>
      streets
        .filter((street: BelisStreet) => street.x && street.y)
        .map((street: BelisStreet, i: number) => ({
          sorter: i,
          string: street.s + (street.m.id ? "" : " (" + street.m.s + ")"),
          glyph: street.g || "road",
          x: street.x,
          y: street.y,
          more: { id: street.m.id || street.s, bounds: street.m.bounds },
          type: "road",
          crs: "EPSG:3857",
          xSearchData: street.s,
        })),
    [streets]
  );

  const { isDatasheetOpen } = useDatasheet();
  const [windowWidth, windowHeight] = useWindowSize();

  // Highlighting via context (used by GraphQL Demo)
  const { setHighlightingActive, highlightByIds, clearHighlights } =
    useMapHighlight();

  // Layer filtering with localForage persistence
  const [initialFilterState, setInitialFilterState] = useState<
    Record<string, boolean> | undefined
  >(undefined);
  const [filterReady, setFilterReady] = useState(false);

  useEffect(() => {
    localForage.getItem<Record<string, boolean>>(FILTER_STORAGE_KEY).then(
      (stored) => {
        if (stored) setInitialFilterState(stored);
        setFilterReady(true);
      },
      () => setFilterReady(true)
    );
  }, []);

  const { enabledFilters, setFilterEnabled, activeSourceLayers } =
    useLayerFilter({
      map,
      categories: BELIS_FILTER_CATEGORIES,
      initialState: initialFilterState,
    });

  // Persist filter changes to localForage
  useEffect(() => {
    if (!filterReady) return;
    localForage.setItem(FILTER_STORAGE_KEY, enabledFilters);
  }, [enabledFilters, filterReady]);

  // Show GraphQL Demo button when URL hash contains "graphqlDemo"
  // Use "graphqlDemo=true" in the URL (bare keys get dropped by updateHashHistoryState)
  const showGraphqlDemo = useMemo(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );
    return params.has("graphqlDemo");
  }, []);

  const showRaw = useMemo(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );
    return params.get("showRaw") === "true";
  }, []);

  const cardGaps = 24 + 24 + 1;
  const navbarHeight = 60;

  const mapStyle = {
    height: windowHeight - navbarHeight - 76,
    width: windowWidth - cardGaps,
    cursor: "pointer",
    clear: "both",
  };

  return (
    <Spin spinning={keyTablesLoading}>
      <div className="mx-3 mt-1">
        <CustomCard
          title={isDatasheetOpen ? "Datenblatt" : "Karte"}
          style={{ marginBottom: "8px" }}
          extra={
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="flex items-center gap-2">
                <StreetSearch gazData={gazData} />
                <SearchModal showFinalQuery={showRaw} />
              </div>

              {/* Filter switches */}
              <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                {BELIS_FILTER_CATEGORIES.map((cat) => (
                  <Switch
                    key={cat.key}
                    checkedChildren={cat.label}
                    unCheckedChildren={cat.label}
                    checked={enabledFilters[cat.key]}
                    onChange={(on) => setFilterEnabled(cat.key, on)}
                  />
                ))}
              </div>

              {/* Blass switch */}
              <div className="flex items-center gap-4 border-l border-gray-300 pl-4">
                <BelisSwitch
                  id="pale-toggle"
                  preLabel="Blass"
                  switched={inPaleMode}
                  stateChanged={(switched) =>
                    dispatch(setPaleModeActive(switched))
                  }
                />
              </div>

              {/* GraphQL Demo (only visible with ?graphqlDemo in hash) */}
              {showGraphqlDemo && (
                <button
                  onClick={() => {
                    if (!jwt) {
                      console.warn(
                        "[GRAPHQL_DEMO] No JWT available, please log in first"
                      );
                      return;
                    }
                    const query = `query Leuchten {
                      tdta_leuchten(limit: 200, where: {einbaudatum: {_gte: "2025-11-11"}}, order_by: {einbaudatum: desc}) {
                        id
                        tdta_standort_mast {
                          geom {
                            geo_field
                          }
                        }
                      }
                    }`;
                    console.log(
                      "[GRAPHQL_DEMO] Fetching leuchten since 2025..."
                    );
                    fetch(ENDPOINT, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${jwt}`,
                      },
                      body: JSON.stringify({ query }),
                    })
                      .then((res) => res.json())
                      .then((json) => {
                        console.log("[GRAPHQL_DEMO] Raw result:", json);
                        const results = json.data?.tdta_leuchten ?? [];
                        console.log(
                          "[GRAPHQL_DEMO] Leuchten count:",
                          results.length
                        );

                        const coords = results
                          .map((l: Record<string, unknown>) => {
                            const mast = l.tdta_standort_mast as
                              | Record<string, unknown>
                              | undefined;
                            const geom = mast?.geom as
                              | Record<string, unknown>
                              | undefined;
                            const geoField = geom?.geo_field as
                              | { coordinates?: [number, number] }
                              | undefined;
                            const utm = geoField?.coordinates;
                            if (!utm) return undefined;
                            return getFromUTM32ToWGS84(utm) as [number, number];
                          })
                          .filter(Boolean) as [number, number][];

                        if (coords.length === 0) {
                          console.warn("[GRAPHQL_DEMO] No coordinates found");
                          return;
                        }

                        const bbox = {
                          minLng: Math.min(...coords.map((c) => c[0])),
                          maxLng: Math.max(...coords.map((c) => c[0])),
                          minLat: Math.min(...coords.map((c) => c[1])),
                          maxLat: Math.max(...coords.map((c) => c[1])),
                        };
                        console.log("[GRAPHQL_DEMO] BBox:", bbox);
                        console.log("[GRAPHQL_DEMO] Coordinates:", coords);

                        // Highlight the returned features on the map
                        const ids = results
                          .map((l: Record<string, unknown>) => String(l.id))
                          .filter(Boolean);
                        clearHighlights();
                        setHighlightingActive(true);
                        const highlightArray = ids.map(
                          (id: string) => `leuchten:${id}`
                        );

                        highlightByIds(highlightArray);
                        console.log(
                          "[GRAPHQL_DEMO] Highlighted",
                          ids.length,
                          "features"
                        );
                        console.log(
                          "[GRAPHQL_DEMO] Highlight Array",
                          highlightArray
                        );

                        if (map) {
                          map.fitBounds(
                            [
                              [bbox.minLng, bbox.minLat],
                              [bbox.maxLng, bbox.maxLat],
                            ],
                            { padding: 50 }
                          );
                          console.log("[GRAPHQL_DEMO] Map fitted to bounds");
                        }
                      })
                      .catch((err) => {
                        console.error("[GRAPHQL_DEMO] Error:", err);
                      });
                  }}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 border-l border-gray-300 ml-0"
                >
                  GraphQL Demo
                </button>
              )}
            </div>
          }
        >
          <BelisMapLibWrapper
            mapSizes={mapStyle}
            activeSourceLayers={activeSourceLayers}
          />
        </CustomCard>
      </div>
    </Spin>
  );
};

export default MainPage;
