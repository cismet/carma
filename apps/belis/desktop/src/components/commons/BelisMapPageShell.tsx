import { useEffect, useMemo, useState } from "react";
import BelisMapLibWrapper from "./BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { CustomCard } from "./CustomCard";
import { useWindowSize } from "@react-hook/window-size";
import type { AppDispatch } from "../../store";
import { useDatasheet } from "@carma-mapping/engines/maplibre";
import { Button, Spin, Tooltip } from "antd";
import { EditOutlined, LockOutlined } from "@ant-design/icons";
import {
  getGlobalEditMode,
  toggleGlobalEditMode,
} from "../../store/slices/featuresForms";
import { getKeyTablesLoading } from "../../store/slices/keyTables";
import SearchModal from "../ui/SearchModal";
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

  const { config } = useMapPage();
  const { title, filterPanel, activeSourceLayers, showSearch } = config;

  const [streets, setStreets] = useState<BelisStreet[]>([]);
  const [highlightResults, setHighlightResults] = useState<
    SidebarFeature[] | null
  >(null);
  const [lassoActive, setLassoActive] = useState(false);

  const { isDatasheetOpen } = useDatasheet();
  const [windowWidth, windowHeight] = useWindowSize();

  const showRaw = useMemo(() => {
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] ?? ""
    );
    return params.get("showRaw") === "true";
  }, []);

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
    <Tooltip
      title={globalEditMode ? "Bearbeitung sperren" : "Alle bearbeiten"}
    >
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
              <div className="flex items-center gap-2">
                <span>{isDatasheetOpen ? "Datenblatt" : title}</span>
                {editModeButton}
              </div>
            ) : undefined
          }
          style={{ marginBottom: "8px" }}
          extra={
            <div className="flex items-center gap-4">
              {windowWidth <= 1364 && editModeButton}

              {showSearch && (
                <div className="flex items-center gap-2">
                  <StreetSearch
                    gazData={gazData}
                    onClearHighlightResults={() => setHighlightResults(null)}
                  />
                  <SearchModal
                    showFinalQuery={showRaw}
                    onSearchResults={setHighlightResults}
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

              {filterPanel}
            </div>
          }
        >
          <BelisMapLibWrapper
            mapSizes={mapStyle}
            activeSourceLayers={activeSourceLayers}
            highlightResults={highlightResults}
            lassoActive={lassoActive}
            onLassoDeactivate={() => setLassoActive(false)}
          />
        </CustomCard>
      </div>
    </Spin>
  );
};

export default BelisMapPageShell;
