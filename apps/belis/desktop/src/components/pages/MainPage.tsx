import { useEffect, useState } from "react";
import {
  useLibreContext,
  useLayerFilter,
} from "@carma-mapping/engines/maplibre";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import localForage from "localforage";
import { useMapPage } from "../../contexts/MapPageContext";

const FILTER_STORAGE_KEY = "@belis-desktop.layerFilter";

const MainPage = () => {
  const { setConfig } = useMapPage();

  const { map } = useLibreContext();

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

  // Register as a map route — show the shell, clear on unmount
  useEffect(() => {
    setConfig({
      isMapRoute: true,
      showSearch: true,
      sidebarVariant: "fachobjekte",
      onFilterChange: (key: string, enabled: boolean) => setFilterEnabled(key, enabled),
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
