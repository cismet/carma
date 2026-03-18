import { useEffect, useState } from "react";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { useMapPage } from "../../contexts/MapPageContext";
import TeamSelect from "../ui/TeamSelect";

const ALL_SOURCE_LAYERS = new Set(
  BELIS_FILTER_CATEGORIES.flatMap((c) => c.sourceLayers)
);

const ArbeitsauftraegeePage = () => {
  const { setConfig } = useMapPage();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  // Register as a map route — show the shell, clear on unmount
  useEffect(() => {
    setConfig({ isMapRoute: true, showSearch: false, sidebarVariant: "arbeitsauftraege" });
    return () => setConfig({ isMapRoute: false });
  }, [setConfig]);

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
