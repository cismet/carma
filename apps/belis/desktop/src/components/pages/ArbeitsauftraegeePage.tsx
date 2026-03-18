import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { useMapPage } from "../../contexts/MapPageContext";
import { clearSelection } from "../../store/slices/arbeitsauftraege";
import type { AppDispatch } from "../../store";

const ALL_SOURCE_LAYERS = new Set(
  BELIS_FILTER_CATEGORIES.flatMap((c) => c.sourceLayers)
);

const ArbeitsauftraegeePage = () => {
  const { setConfig } = useMapPage();
  const dispatch: AppDispatch = useDispatch();

  useEffect(() => {
    setConfig({
      isMapRoute: true,
      showSearch: false,
      sidebarVariant: "arbeitsauftraege",
      title: "Arbeitsaufträge",
      activeSourceLayers: ALL_SOURCE_LAYERS,
      filterConfig: { variant: "arbeitsauftraege" },
    });
    return () => {
      setConfig({ isMapRoute: false });
      dispatch(clearSelection());
    };
  }, [setConfig, dispatch]);

  return null;
};

export default ArbeitsauftraegeePage;
