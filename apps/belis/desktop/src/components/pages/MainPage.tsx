import { useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { AppDispatch } from "../../store";
import {
  useLibreContext,
  useLayerFilter,
} from "@carma-mapping/engines/maplibre";
import { getJWT } from "../../store/slices/auth";
import { ENDPOINT } from "../../constants/belis";
import { getFromUTM32ToWGS84 } from "@carma/geo/proj";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { message, Switch } from "antd";
import {
  getKeyTablesFetched,
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
} from "../../store/slices/keyTables";
import LeitungstypDropdown from "../ui/LeitungstypDropdown";
import { fetchAllKeyTables } from "../../helper/apiMethods";
import localForage from "localforage";
import { useMapPage } from "../../contexts/MapPageContext";

const FILTER_STORAGE_KEY = "@belis-desktop.layerFilter";

const MainPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const keyTablesFetched = useSelector(getKeyTablesFetched);
  const { setConfig } = useMapPage();

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
  const showGraphqlDemo = useMemo(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );
    return params.has("graphqlDemo");
  }, []);

  // Register as a map route — show the shell, clear on unmount
  useEffect(() => {
    setConfig({ isMapRoute: true, showSearch: true, sidebarVariant: "fachobjekte" });
    return () => setConfig({ isMapRoute: false });
  }, [setConfig]);

  // Keep the shell's filter panel and layer config in sync
  useEffect(() => {
    setConfig({
      title: "Fachobjekte",
      activeSourceLayers,
      filterPanel: (
        <>
          <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
            {BELIS_FILTER_CATEGORIES.map((cat) => (
              <div key={cat.key} className="flex items-center">
                <Switch
                  checkedChildren={cat.label}
                  unCheckedChildren={cat.label}
                  checked={enabledFilters[cat.key]}
                  onChange={(on) => setFilterEnabled(cat.key, on)}
                />
                {cat.key === "leitungen" && <LeitungstypDropdown />}
              </div>
            ))}
          </div>

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
                console.log("[GRAPHQL_DEMO] Fetching leuchten since 2025...");
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
        </>
      ),
    });
  }, [enabledFilters, activeSourceLayers, setConfig, setFilterEnabled, jwt, showGraphqlDemo, map]);

  return null;
};

export default MainPage;
