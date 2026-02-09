import { CarmaMap } from "@carma-mapping/core";
import { useDispatch, useSelector } from "react-redux";
import { setSelectedFeature } from "../../store/slices/featureCollection";
import { AppDispatch } from "../../store";
import OnMapList from "../ui/OnMapList";
import { useMapSelection } from "@carma-mapping/engines/maplibre";
import { useEffect } from "react";
import { getJWT } from "../../store/slices/auth";
import {
  FeatureType,
  fetchFeatureById,
  fetchLeitungById,
} from "../../helper/apiMethods";

const LIST_WIDTH = 300;

const BelisMapLibWrapper = ({ mapSizes }) => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const { selectedFeature, selectedFeatureId } = useMapSelection();

  useEffect(() => {
    const fetchData = async () => {
      if (!jwt || !selectedFeatureId?.id) return;

      // Get sourceLayer from selectedFeatureId or rawFeature
      const sourceLayer = selectedFeatureId.sourceLayer;

      console.log("xxx BelisMa Selection:", {
        id: selectedFeatureId.id,
        sourceLayer,
      });

      if (sourceLayer && selectedFeatureId.id) {
        try {
          const fullData = await fetchFeatureById(
            jwt,
            selectedFeatureId.id as number,
            sourceLayer as FeatureType
          );
          console.log("xxx Fetched full data:", fullData);
        } catch (error) {
          console.error("xxx Failed to fetch feature:", error);
        }
      }
    };

    fetchData();
  }, [selectedFeatureId, jwt, dispatch]);

  // Sync selection to Redux store when map selection changes (fallback)
  useEffect(() => {
    if (selectedFeature) {
      dispatch(setSelectedFeature({ ...selectedFeature, selected: true }));
    }
  }, [selectedFeature, dispatch]);

  const mapWidth = mapSizes.width - LIST_WIDTH;

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      <OnMapList
        visibleMapWidth={mapWidth}
        visibleMapHeight={mapSizes.height}
      />
      <div style={{ width: mapWidth, height: mapSizes.height }}>
        <CarmaMap
          mapEngine="maplibre"
          embedded
          backgroundLayers="basemap_grey@60" // "wupp-plan-live-tiles-3857" // "basemap_grey" // "basemap_relief" // "basemap_color"
          terrainControl={false}
          fullScreenControl={false}
          libreLayers={[
            {
              type: "vector",
              name: "Leuchten",
              style: "https://tiles.cismet.de/belis/style.json",
            },
          ]}
        />
      </div>
    </div>
  );
};

export default BelisMapLibWrapper;
