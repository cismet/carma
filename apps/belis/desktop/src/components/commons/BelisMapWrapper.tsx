import { useState } from "react";
import { CarmaMap } from "@carma-mapping/core";
import { useDispatch } from "react-redux";
import { setSelectedFeature } from "../../store/slices/featureCollection";
import { AppDispatch } from "../../store";
import OnMapList from "../ui/OnMapList";
import type { Map as MaplibreMap } from "maplibre-gl";

interface SelectedVectorObject {
  source: string;
  sourceLayer?: string;
  id?: string | number;
}

const LIST_WIDTH = 300;

const BelisMapLibWrapper = ({ mapSizes }) => {
  const dispatch: AppDispatch = useDispatch();
  const [libreMap, setLibreMap] = useState<MaplibreMap | null>(null);
  const [selectedVectorObject, setSelectedVectorObject] =
    useState<SelectedVectorObject | null>(null);

  const handleSelectedFeature = (
    feature,
    selectionInfo?: {
      source: string;
      sourceLayer?: string;
      id?: string | number;
    }
  ) => {
    if (feature) {
      const updatedFeature = { ...feature, selected: true };
      dispatch(setSelectedFeature(updatedFeature));
      console.log("xxx feature", updatedFeature);

      // Update the selected vector object for list sync
      if (selectionInfo) {
        setSelectedVectorObject(selectionInfo);
      }
    }
  };

  const handleListFeatureSelect = (feature) => {
    // When a feature is selected from the list, also trigger the map's feature select
    handleSelectedFeature(feature, {
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      id: feature.id,
    });
  };

  const mapWidth = mapSizes.width - LIST_WIDTH;

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      <OnMapList
        maplibreMap={libreMap}
        selectedVectorObject={selectedVectorObject}
        setSelectedVectorObject={setSelectedVectorObject}
        onFeatureSelect={handleListFeatureSelect}
        visibleMapWidth={mapWidth}
        visibleMapHeight={mapSizes.height}
      />
      <div style={{ width: mapWidth, height: mapSizes.height }}>
        <CarmaMap
          mapEngine="maplibre"
          embedded
          terrainControl={false}
          fullScreenControl={false}
          setLibreMap={setLibreMap}
          libreLayers={[
            {
              type: "vector",
              name: "Leuchten",
              style: "https://tiles.cismet.de/belis/style.json",
            },
          ]}
          onFeatureSelect={handleSelectedFeature}
        />
      </div>
    </div>
  );
};

export default BelisMapLibWrapper;
