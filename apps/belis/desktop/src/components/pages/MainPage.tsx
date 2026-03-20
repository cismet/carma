import { useEffect } from "react";
import {
  useLibreContext,
  useLayerFilter,
} from "@carma-mapping/engines/maplibre";
import { useSelector, useDispatch } from "react-redux";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { useMapPage } from "../../contexts/MapPageContext";
import {
  getEnabledCategoryFilters,
  setAllCategoryFilters,
} from "../../store/slices/mapSettings";

const MainPage = () => {
  const { setConfig } = useMapPage();
  const dispatch = useDispatch();

  const { map } = useLibreContext();

  // Filter state from Redux (persisted via redux-persist)
  const storedFilters = useSelector(getEnabledCategoryFilters);
  const initialState =
    Object.keys(storedFilters).length > 0 ? storedFilters : undefined;

  const { enabledFilters, setFilterEnabled, activeSourceLayers } =
    useLayerFilter({
      map,
      categories: BELIS_FILTER_CATEGORIES,
      initialState,
    });

  // Sync filter changes back to Redux
  useEffect(() => {
    dispatch(setAllCategoryFilters(enabledFilters));
  }, [enabledFilters, dispatch]);

  // Register as a map route — show the shell, clear on unmount
  useEffect(() => {
    setConfig({
      isMapRoute: true,
      showSearch: true,
      sidebarVariant: "fachobjekte",
      onFilterChange: (key: string, enabled: boolean) =>
        setFilterEnabled(key, enabled),
    });
    return () => setConfig({ isMapRoute: false, onFilterChange: null });
  }, [setConfig, setFilterEnabled]);

  // Keep the shell's filter config and layer config in sync
  useEffect(() => {
    setConfig({
      title: "Fachobjekte",
      activeSourceLayers,
      filterConfig: { variant: "fachobjekte", enabledFilters },
    });
  }, [enabledFilters, activeSourceLayers, setConfig]);

  return null;
};

export default MainPage;
