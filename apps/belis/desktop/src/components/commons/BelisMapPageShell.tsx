import { useCallback, useEffect, useMemo, useState } from "react";
import BelisMapLibWrapper from "./BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { CustomCard } from "./CustomCard";
import { useWindowSize } from "@react-hook/window-size";
import type { AppDispatch } from "../../store";
import { useDatasheet } from "@carma-mapping/engines/maplibre";
import { Badge, Button, Spin, Switch, Tooltip } from "antd";
import {
  EditOutlined,
  LockOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  getGlobalEditMode,
  toggleGlobalEditMode,
} from "../../store/slices/featuresForms";
import { getKeyTablesLoading } from "../../store/slices/keyTables";
import {
  getSelectedTeamId,
  setSelectedTeamId,
  clearSelection,
  getDraftMode,
  setDraftMode,
} from "../../store/slices/arbeitsauftraege";
import { getTotalDraftCount } from "../../store/slices/arbeitsauftraegeDrafts";
import {
  BELIS_FILTER_CATEGORIES,
  BELIS_BRAND_NEW_FC_URL,
} from "../../config/mapLayerConfigs";
import LeitungstypDropdown from "../ui/LeitungstypDropdown";
import TeamSelect from "../ui/TeamSelect";
import SearchModal from "../ui/SearchModal";
import ArbeitsauftragSearchModal from "../ui/ArbeitsauftragSearchModal";
import StreetSearch from "../ui/StreetSearch";
import type { SidebarFeature } from "../ui/BelisSidebar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDrawPolygon } from "@fortawesome/free-solid-svg-icons";
import { useMapPage } from "../../contexts/MapPageContext";

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

const BelisMapPageShell = () => {
  const dispatch: AppDispatch = useDispatch();
  const keyTablesLoading = useSelector(getKeyTablesLoading);
  const globalEditMode = useSelector(getGlobalEditMode);

  const selectedTeamId = useSelector(getSelectedTeamId);
  const draftMode = useSelector(getDraftMode);
  const totalDraftCount = useSelector(getTotalDraftCount);

  const { config } = useMapPage();
  const {
    title,
    filterConfig,
    activeSourceLayers,
    showSearch,
    sidebarVariant,
    onFilterChange,
  } = config;

  const [streets, setStreets] = useState<BelisStreet[]>([]);
  const { setActiveHighlights } = useMapPage();

  const [highlightResults, setHighlightResults] = useState<
    SidebarFeature[] | null
  >(null);
  const [lassoActive, setLassoActive] = useState(false);

  const handleHighlightsChange = useCallback(
    (highlights: SidebarFeature[] | null) => {
      setActiveHighlights(highlights);
    },
    [setActiveHighlights]
  );

  const { isDatasheetOpen, closeDatasheet } = useDatasheet();
  const [windowWidth, windowHeight] = useWindowSize();

  const showRaw = useMemo(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );
    const param = params.get("showRaw");
    if (param !== null) return param === "true";
    return window.location.hostname === "localhost";
  }, []);

  // Local-dev-only Fachobjekte source toggles (yellow border indicates dev UI)
  const isLocalDev = useMemo(
    () => window.location.hostname === "localhost",
    []
  );
  const [regularLayerEnabled, setRegularLayerEnabled] = useState(true);
  const [brandnewLayerEnabled, setBrandnewLayerEnabled] = useState(false);
  const [brandnewCount, setBrandnewCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isLocalDev) return;
    let cancelled = false;
    fetch(BELIS_BRAND_NEW_FC_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => {
        if (cancelled) return;
        setBrandnewCount(
          Array.isArray(fc?.features) ? fc.features.length : 0
        );
      })
      .catch(() => {
        if (!cancelled) setBrandnewCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isLocalDev]);

  // Auto-exit draft mode when all drafts have been cancelled/removed
  useEffect(() => {
    if (draftMode && totalDraftCount === 0) {
      dispatch(setDraftMode(false));
    }
  }, [draftMode, totalDraftCount, dispatch]);

  // Fetch streets data once
  useEffect(() => {
    if (streets.length > 0) return;

    fetch("https://wunda-geoportal.cismet.de/data/3857/belisStrassen.json")
      .then((res) => res.json())
      .then((data: BelisStreet[]) => setStreets(data))
      .catch((error) => console.error("Failed to fetch streets:", error));
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

  const cardGaps = 24 + 24 + 1;
  const navbarHeight = 60;

  const mapStyle = {
    height: windowHeight - navbarHeight - 76,
    width: windowWidth - cardGaps,
    cursor: "pointer",
    clear: "both",
  };

  const editModeButton = (
    <Tooltip title={globalEditMode ? "Bearbeitung sperren" : "Alle bearbeiten"}>
      <Button
        icon={globalEditMode ? <LockOutlined /> : <EditOutlined />}
        type={globalEditMode ? "primary" : "default"}
        size="small"
        onClick={() => dispatch(toggleGlobalEditMode())}
      />
    </Tooltip>
  );

  return (
    <Spin spinning={keyTablesLoading}>
      <div className="mx-3 mt-1">
        <CustomCard
          title={
            windowWidth > 1364 ? (
              <div className="flex items-center gap-2 my-1">
                <span>{isDatasheetOpen ? "Datenblatt" : title}</span>
                {editModeButton}
                {sidebarVariant === "arbeitsauftraege" &&
                  totalDraftCount > 0 && (
                    <Badge
                      count={totalDraftCount}
                      size="small"
                      offset={[-2, 2]}
                      style={{
                        fontSize: 10,
                        minWidth: 14,
                        height: 14,
                        lineHeight: "14px",
                        padding: "0 3px",
                      }}
                    >
                      <button
                        onClick={() => dispatch(setDraftMode(!draftMode))}
                        className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                          draftMode
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                        }`}
                        title={
                          draftMode
                            ? "Entwurfsmodus beenden"
                            : "Entwürfe anzeigen"
                        }
                      >
                        <SaveOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Badge>
                  )}
              </div>
            ) : undefined
          }
          style={{ marginBottom: "8px" }}
          extra={
            <div className="flex items-center gap-4">
              {windowWidth <= 1364 && editModeButton}
              {windowWidth <= 1364 &&
                sidebarVariant === "arbeitsauftraege" &&
                totalDraftCount > 0 && (
                  <Badge
                    count={totalDraftCount}
                    size="small"
                    offset={[-2, 2]}
                    style={{
                      fontSize: 10,
                      minWidth: 14,
                      height: 14,
                      lineHeight: "14px",
                      padding: "0 3px",
                    }}
                  >
                    <button
                      onClick={() => dispatch(setDraftMode(!draftMode))}
                      className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                        draftMode
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                      }`}
                      title={
                        draftMode
                          ? "Entwurfsmodus beenden"
                          : "Entwürfe anzeigen"
                      }
                    >
                      <SaveOutlined style={{ fontSize: 12 }} />
                    </button>
                  </Badge>
                )}

              {showSearch && (
                <div className="flex items-center gap-2">
                  <StreetSearch
                    gazData={gazData}
                    onClearHighlightResults={() => {
                      setHighlightResults(null);
                      closeDatasheet();
                    }}
                  />
                  <SearchModal
                    showFinalQuery={showRaw}
                    onSearchResults={(features) => {
                      setHighlightResults(features);
                      closeDatasheet();
                    }}
                  />
                </div>
              )}

              {showSearch && (
                <button
                  onClick={() => setLassoActive((prev) => !prev)}
                  title={
                    lassoActive
                      ? "Lasso-Auswahl beenden"
                      : "Lasso-Auswahl starten"
                  }
                  className={`flex items-center justify-center w-8 h-8 rounded border ${
                    lassoActive
                      ? "border-blue-500 bg-blue-50 text-blue-600"
                      : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <FontAwesomeIcon icon={faDrawPolygon} />
                </button>
              )}

              {filterConfig?.variant === "fachobjekte" && onFilterChange && (
                <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
                  {BELIS_FILTER_CATEGORIES.map((cat) => (
                    <div key={cat.key} className="flex items-center">
                      {cat.key === "leitungen" ? (
                        <LeitungstypDropdown
                          masterChecked={filterConfig.enabledFilters[cat.key]}
                          onMasterChange={(on) => onFilterChange(cat.key, on)}
                        >
                          <Switch
                            checkedChildren={cat.label}
                            unCheckedChildren={cat.label}
                            checked={filterConfig.enabledFilters[cat.key]}
                            onChange={(on) => onFilterChange(cat.key, on)}
                          />
                        </LeitungstypDropdown>
                      ) : (
                        <Switch
                          checkedChildren={cat.label}
                          unCheckedChildren={cat.label}
                          checked={filterConfig.enabledFilters[cat.key]}
                          onChange={(on) => onFilterChange(cat.key, on)}
                        />
                      )}
                    </div>
                  ))}
                  {isLocalDev && (
                    <div
                      className="flex items-center gap-2 ml-2 px-2 py-1 rounded"
                      style={{
                        border: "2px solid #facc15",
                        background: "#fefce8",
                      }}
                      title="Local-dev only: choose which Fachobjekte source to render"
                    >
                      <Switch
                        checkedChildren="regular"
                        unCheckedChildren="regular"
                        checked={regularLayerEnabled}
                        onChange={setRegularLayerEnabled}
                        style={
                          regularLayerEnabled
                            ? { backgroundColor: "#eab308" }
                            : undefined
                        }
                      />
                      <Badge
                        count={brandnewCount ?? 0}
                        showZero
                        overflowCount={9999}
                        style={{ backgroundColor: "#eab308" }}
                      >
                        <Switch
                          checkedChildren="brandnew"
                          unCheckedChildren="brandnew"
                          checked={brandnewLayerEnabled}
                          onChange={setBrandnewLayerEnabled}
                          style={
                            brandnewLayerEnabled
                              ? { backgroundColor: "#eab308" }
                              : undefined
                          }
                        />
                      </Badge>
                    </div>
                  )}
                </div>
              )}

              {filterConfig?.variant === "arbeitsauftraege" && (
                <div className="flex items-center gap-2 ml-auto">
                  <ArbeitsauftragSearchModal onSearchDone={closeDatasheet} />
                  <TeamSelect
                    value={selectedTeamId}
                    onChange={(id) => {
                      dispatch(setSelectedTeamId(id));
                      dispatch(clearSelection());
                      closeDatasheet();
                    }}
                  />
                </div>
              )}
            </div>
          }
        >
          <BelisMapLibWrapper
            mapSizes={mapStyle}
            activeSourceLayers={activeSourceLayers}
            highlightResults={highlightResults}
            lassoActive={lassoActive}
            onLassoDeactivate={() => setLassoActive(false)}
            sidebarVariant={sidebarVariant}
            onHighlightsChange={handleHighlightsChange}
            regularLayerEnabled={regularLayerEnabled}
            brandnewLayerEnabled={brandnewLayerEnabled}
            onBrandnewCountChange={setBrandnewCount}
          />
        </CustomCard>
      </div>
    </Spin>
  );
};

export default BelisMapPageShell;
