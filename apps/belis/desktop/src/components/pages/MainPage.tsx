import { useCallback, useContext, useEffect, useState } from "react";
import BelisMapLibWrapper from "../commons/BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { CustomCard } from "../commons/CustomCard";
import { useWindowSize } from "@react-hook/window-size";
import {
  BelisSwitch,
  featuresFilter,
  loadObjectsIntoFeatureCollection,
} from "@carma-appframeworks/belis";
import { AppDispatch } from "../../store";
import {
  isInFocusMode,
  setDone,
  setFeatureCollection,
  setFocusModeActive,
} from "../../store/slices/featureCollection";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import {
  useDatasheet,
  useLibreContext,
  useMapHighlight,
  useLayerFilter,
} from "@carma-mapping/engines/maplibre";
import { DOMAIN, REST_SERVICE } from "../../constants/belis";
import type { UnknownAction } from "redux";
import {
  isInPaleMode,
  isSearchForbidden,
  setPaleModeActive,
} from "../../store/slices/mapSettings";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { Switch } from "antd";
import localForage from "localforage";

const FILTER_STORAGE_KEY = "@belis-desktop.layerFilter";

const MainPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const inFocusMode = useSelector(isInFocusMode);
  const inPaleMode = useSelector(isInPaleMode);

  const { map } = useLibreContext();
  const { isDatasheetOpen } = useDatasheet();
  const [windowWidth, windowHeight] = useWindowSize();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  // Search state
  const [searchText, setSearchText] = useState("00026");

  // Highlighting via context
  const {
    highlightingActive,
    setHighlightingActive,
    highlightByProperty,
    clearHighlights,
  } = useMapHighlight();

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

  // Search handlers
  const handleSearch = useCallback(() => {
    if (!map || !searchText.trim()) return;
    setHighlightingActive(true);
    highlightByProperty(
      "strassenschluessel",
      new RegExp(searchText.trim(), "i")
    );
  }, [map, searchText, setHighlightingActive, highlightByProperty]);

  const handleClearSearch = useCallback(() => {
    setHighlightingActive(false);
    clearHighlights();
    setSearchText("");
  }, [setHighlightingActive, clearHighlights]);

  const cardGaps = 24 + 24 + 1;
  const navbarHeight = 60;

  const mapStyle = {
    height: windowHeight - navbarHeight - 76,
    width: windowWidth - cardGaps,
    cursor: "pointer",
    clear: "both",
  };

  return (
    <>
      <div className="mx-3 mt-1">
        <CustomCard
          title={isDatasheetOpen ? "Datenblatt" : "Karte"}
          style={{ marginBottom: "8px" }}
          extra={
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Strassenschluessel..."
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                />
                <button
                  onClick={handleSearch}
                  disabled={!searchText.trim()}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Suche
                </button>
                {highlightingActive && (
                  <button
                    onClick={handleClearSearch}
                    className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                  >
                    {"\u2715"}
                  </button>
                )}
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

              {/* Existing Fokus/Blass switches */}
              <div className="flex items-center gap-4 border-l border-gray-300 pl-4">
                <BelisSwitch
                  preLabel="Fokus"
                  switched={inFocusMode}
                  stateChanged={(switched) => {
                    dispatch(setFocusModeActive(switched));
                    setTimeout(() => {
                      dispatch(
                        loadObjectsIntoFeatureCollection(
                          {
                            boundingBox: routedMapRef.getBoundingBox(),
                            inFocusMode: switched,
                            jwt: storedJWT,
                          },
                          REST_SERVICE,
                          DOMAIN,
                          setFeatureCollection,
                          featuresFilter,
                          setDone,
                          isSearchForbidden
                        ) as unknown as UnknownAction
                      );
                    }, 300);
                  }}
                />
                <BelisSwitch
                  id="pale-toggle"
                  preLabel="Blass"
                  switched={inPaleMode}
                  stateChanged={(switched) =>
                    dispatch(setPaleModeActive(switched))
                  }
                />
              </div>
            </div>
          }
        >
          <BelisMapLibWrapper
            mapSizes={mapStyle}
            activeSourceLayers={activeSourceLayers}
          />
        </CustomCard>
      </div>
    </>
  );
};

export default MainPage;
