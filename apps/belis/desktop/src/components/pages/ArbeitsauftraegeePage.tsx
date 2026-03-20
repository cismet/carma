import { useEffect } from "react";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { useMapPage } from "../../contexts/MapPageContext";

const ALL_SOURCE_LAYERS = new Set(
  BELIS_FILTER_CATEGORIES.flatMap((c) => c.sourceLayers)
);

const ArbeitsauftraegeePage = () => {
  const { setConfig } = useMapPage();

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
    };
  }, [setConfig]);

  return null;
};

export default ArbeitsauftraegeePage;
