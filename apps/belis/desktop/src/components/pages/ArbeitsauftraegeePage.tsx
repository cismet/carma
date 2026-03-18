import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { message } from "antd";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { useMapPage } from "../../contexts/MapPageContext";
import { clearSelection } from "../../store/slices/arbeitsauftraege";
import {
  getKeyTablesFetched,
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
} from "../../store/slices/keyTables";
import { getJWT } from "../../store/slices/auth";
import { fetchAllKeyTables } from "../../helper/apiMethods";
import type { AppDispatch } from "../../store";
import TeamSelect from "../ui/TeamSelect";

const ALL_SOURCE_LAYERS = new Set(
  BELIS_FILTER_CATEGORIES.flatMap((c) => c.sourceLayers)
);

const ArbeitsauftraegeePage = () => {
  const { setConfig } = useMapPage();
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const keyTablesFetched = useSelector(getKeyTablesFetched);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  // Ensure key tables (teams, etc.) are loaded even when landing directly on this route
  useEffect(() => {
    if (keyTablesFetched || !jwt) return;

    const fetchData = async () => {
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

  // Register as a map route — show the shell, clear on unmount
  useEffect(() => {
    setConfig({ isMapRoute: true, showSearch: false, sidebarVariant: "arbeitsauftraege" });
    return () => {
      setConfig({ isMapRoute: false });
      dispatch(clearSelection());
    };
  }, [setConfig, dispatch]);

  // Keep the shell's filter panel in sync with local dropdown state
  useEffect(() => {
    setConfig({
      title: "Arbeitsaufträge",
      activeSourceLayers: ALL_SOURCE_LAYERS,
      filterPanel: (
        <div>
          <TeamSelect value={selectedTeamId} onChange={setSelectedTeamId} />
        </div>
      ),
    });
  }, [selectedTeamId, setConfig]);

  return null;
};

export default ArbeitsauftraegeePage;
