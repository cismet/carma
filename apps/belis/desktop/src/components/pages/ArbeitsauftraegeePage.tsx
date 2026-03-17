import { useEffect, useState } from "react";
import { Select } from "antd";
import { BELIS_FILTER_CATEGORIES } from "../../config/mapLayerConfigs";
import { useMapPage } from "../../contexts/MapPageContext";

const ALL_SOURCE_LAYERS = new Set(
  BELIS_FILTER_CATEGORIES.flatMap((c) => c.sourceLayers)
);

const BEARBEITUNGSSTAND_OPTIONS = [
  { value: "alle", label: "Alle Aufträge" },
  { value: "offen", label: "Nur offene" },
  { value: "abgearbeitet", label: "Nur abgearbeitete" },
];

const ArbeitsauftraegeePage = () => {
  const { setConfig } = useMapPage();
  const [selected, setSelected] = useState<string>("alle");

  // Register as a map route — show the shell, clear on unmount
  useEffect(() => {
    setConfig({ isMapRoute: true });
    return () => setConfig({ isMapRoute: false });
  }, [setConfig]);

  // Keep the shell's filter panel in sync with local dropdown state
  useEffect(() => {
    setConfig({
      title: "Arbeitsaufträge",
      activeSourceLayers: ALL_SOURCE_LAYERS,
      filterPanel: (
        <div className="border-l border-gray-300 pl-4">
          <Select
            value={selected}
            onChange={setSelected}
            options={BEARBEITUNGSSTAND_OPTIONS}
            style={{ width: 200 }}
          />
        </div>
      ),
    });
  }, [selected, setConfig]);

  return null;
};

export default ArbeitsauftraegeePage;
