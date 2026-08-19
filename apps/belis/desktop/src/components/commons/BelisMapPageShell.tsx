import { useCallback, useEffect, useMemo, useState } from "react";
import BelisMapLibWrapper from "./BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { CustomCard } from "./CustomCard";
import { useWindowSize } from "@react-hook/window-size";
import type { AppDispatch } from "../../store";
import {
  useDatasheet,
  useMapHighlight,
} from "@carma-mapping/engines/maplibre";
import { Badge, Button, Spin, Switch, Tooltip } from "antd";
import { EditOutlined, LockOutlined, SaveOutlined } from "@ant-design/icons";
import {
  getGlobalEditMode,
  toggleGlobalEditMode,
} from "../../store/slices/featuresForms";
import { getIsReadOnly } from "../../store/slices/auth";
import { getKeyTablesLoading } from "../../store/slices/keyTables";
import {
  getSelectedTeamId,
  setSelectedTeamId,
  clearSelection,
  getDraftMode,
  setDraftMode,
} from "../../store/slices/arbeitsauftraege";
import { getTotalDraftCount } from "../../store/slices/arbeitsauftraegeDrafts";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { BELIS_BRAND_NEW_FC_URL } from "../../constants/belis";
import LeitungstypDropdown from "../ui/LeitungstypDropdown";
import TeamSelect from "../ui/TeamSelect";
import SearchModal from "../ui/SearchModal";
import ArbeitsauftragSearchModal from "../ui/ArbeitsauftragSearchModal";
import StreetSearch from "../ui/StreetSearch";
import type { SidebarFeature } from "../ui/BelisSidebar";
import type { ExpertSortSpec } from "../ui/expert-search/expertSearchUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDrawPolygon } from "@fortawesome/free-solid-svg-icons";
import { useMapPage } from "../../contexts/MapPageContext";
import { getFeatureCollection } from "../../store/slices/featureCollection";
import ExportCsvButton from "../ui/ExportCsvButton";
import PrintControl from "../ui/PrintControl";
import PasteChangesToHighlightsButton from "../ui/PasteChangesToHighlightsButton";
import {
  SHOW_MAP_EXPORT_AND_PRINT,
  SHOW_REPEATABLE_CHANGES_UI,
} from "../../constants/uiVisibility";

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
  const isReadOnly = useSelector(getIsReadOnly);

  const selectedTeamId = useSelector(getSelectedTeamId);
  const draftMode = useSelector(getDraftMode);
  const totalDraftCount = useSelector(getTotalDraftCount);
  const featureCollection = useSelector(getFeatureCollection);

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
  const { activeHighlights, setActiveHighlights } = useMapPage();

  const [highlightResults, setHighlightResults] = useState<
    SidebarFeature[] | null
  >(null);
  // Sort list (field + direction) behind the current `highlightResults`, empty
  // for classic searches. Feeds the sidebar so both the Highlights and the
  // Fachobjekte lists follow that order; reset to empty on clear.
  const [highlightExpertSort, setHighlightExpertSort] = useState<ExpertSortSpec>(
    []
  );
  const [lassoActive, setLassoActive] = useState(false);

  // Route switch (Fachobjekte ↔ Arbeitsaufträge) disarms the lasso. The shell is
  // always mounted (Layout only toggles display), so local state survives the
  // change — and the toggle button lives behind `showSearch`, i.e. it is gone on
  // Arbeitsaufträge. Without this reset the lasso keeps swallowing map drags
  // there with no visible way to turn it off.
  useEffect(() => {
    setLassoActive(false);
  }, [sidebarVariant]);

  // Shift switches the armed lasso to "refine" mode (keep only the highlighted
  // features inside the shape). Mirror the key state so the button can show it,
  // and only while the lasso is armed — no global key listener otherwise.
  // Refining needs an existing selection, so the mode is real only while
  // highlighting is on; the button must not promise it otherwise.
  const { highlightingActive } = useMapHighlight();
  const [shiftHeld, setShiftHeld] = useState(false);
  const refineMode = lassoActive && shiftHeld && highlightingActive;
  useEffect(() => {
    if (!lassoActive) {
      setShiftHeld(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    // Releasing Shift while the window is unfocused never reaches us, so the
    // state would stick — reset whenever focus leaves.
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [lassoActive]);

  // Filter-aware highlight list (mirrors the Highlights sidebar tab): the CSV
  // export uses this so it exports exactly the visible selection. The unfiltered
  // `activeHighlights` channel is left untouched for the Arbeitsauftrag actions.
  const [filteredHighlights, setFilteredHighlights] = useState<
    SidebarFeature[] | null
  >(null);

  // Export mirrors the visible selection. Once highlights exist, the filter-aware
  // list wins even when it is empty — so toggling every category off (which drops
  // all highlights from the sidebar) also empties the export and disables the
  // button, instead of silently falling back to the unfiltered selection. Only
  // when there are no highlights at all do we fall back to the viewport list.
  const exportableFeatures = activeHighlights?.length
    ? filteredHighlights ?? []
    : highlightResults?.length
    ? highlightResults
    : featureCollection ?? [];

  const handleHighlightsChange = useCallback(
    (highlights: SidebarFeature[] | null) => {
      setActiveHighlights(highlights);
    },
    [setActiveHighlights]
  );

  const handleFilteredHighlightsChange = useCallback(
    (highlights: SidebarFeature[] | null) => {
      setFilteredHighlights(highlights);
    },
    []
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
  const [brandnewLayerEnabled, setBrandnewLayerEnabled] = useState(true);
  const [brandnewCount, setBrandnewCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isLocalDev) return;
    let cancelled = false;
    fetch(BELIS_BRAND_NEW_FC_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => {
        if (cancelled) return;
        setBrandnewCount(Array.isArray(fc?.features) ? fc.features.length : 0);
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

  // Horizontal chrome around the map wrapper inside the Card:
  // mx-3 margins (12+12) + Card body padding (12+12) + Card borders (1+1).
  const cardGaps = 24 + 24 + 2;
  const navbarHeight = 60;

  const mapStyle = {
    height: windowHeight - navbarHeight - 76,
    width: windowWidth - cardGaps,
    cursor: "pointer",
    clear: "both",
  };

  // Read-only ("Gast") users cannot enter edit mode, so the toggle is hidden.
  const editModeButton = isReadOnly ? null : (
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
          className="belis-map-card"
          title={
            windowWidth > 1364 ? (
              <div className="flex items-center gap-2 my-1">
                <span>{isDatasheetOpen ? "Datenblatt" : title}</span>
                {editModeButton}
                {/* Batch "Wiederholfelder einfügen" — shows itself only when
                    something was copied AND matching features are highlighted,
                    so it stays out of the header the rest of the time. It stays
                    reachable with a Datenblatt open; the feature shown there is
                    excluded from the batch (its mounted AntD form owns the
                    draft and would push pre-paste values back on the next
                    keystroke) and is served by that form's own paste button. */}
                {SHOW_REPEATABLE_CHANGES_UI &&
                  sidebarVariant === "fachobjekte" && (
                    <PasteChangesToHighlightsButton />
                  )}
                {!isReadOnly &&
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
              </div>
            ) : undefined
          }
          style={{ marginBottom: "8px" }}
          extra={
            <div className="flex items-center gap-4">
              {windowWidth <= 1364 && editModeButton}
              {!isReadOnly &&
                windowWidth <= 1364 &&
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
                      setHighlightExpertSort([]);
                      closeDatasheet();
                    }}
                  />
                  <SearchModal
                    showFinalQuery={showRaw}
                    onSearchResults={(features, meta) => {
                      setHighlightResults(features);
                      setHighlightExpertSort(meta?.expertSort ?? []);
                      closeDatasheet();
                    }}
                  />
                </div>
              )}

              {showSearch && (
                <div className="flex items-center gap-2 mr-[1px]">
                  <button
                    onClick={() => setLassoActive((prev) => !prev)}
                    title={
                      refineMode
                        ? "Umgrenzung zeichnen: nur markierte Objekte darin bleiben markiert"
                        : lassoActive
                        ? "Lasso-Auswahl beenden (Shift: Markierung eingrenzen)"
                        : "Lasso-Auswahl starten"
                    }
                    className={`flex items-center justify-center w-8 h-8 rounded border ${
                      refineMode
                        ? "border-orange-500 bg-orange-50 text-orange-500"
                        : lassoActive
                        ? "border-blue-500 bg-blue-50 text-blue-600"
                        : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <FontAwesomeIcon icon={faDrawPolygon} />
                  </button>
                  {SHOW_MAP_EXPORT_AND_PRINT && (
                    <>
                      <ExportCsvButton features={exportableFeatures} />
                      <PrintControl />
                    </>
                  )}
                </div>
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
            highlightExpertSort={highlightExpertSort}
            lassoActive={lassoActive}
            onLassoDeactivate={() => setLassoActive(false)}
            sidebarVariant={sidebarVariant}
            onHighlightsChange={handleHighlightsChange}
            onFilteredHighlightsChange={handleFilteredHighlightsChange}
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
