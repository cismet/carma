import { useEffect, useMemo } from "react";
import { CarmaMap } from "@carma-mapping/core";
import { useDispatch, useSelector } from "react-redux";
import { setSelectedFeature } from "../../store/slices/featureCollection";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getActiveAdditionalLayers,
  getAdditionalLayerOpacities,
} from "../../store/slices/mapSettings";
import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
  leuchtenDataLayer,
} from "../../config/mapLayerConfigs";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import { AppDispatch } from "../../store";
import OnMapList from "../ui/OnMapList";
import { useMapSelection } from "@carma-mapping/engines/maplibre";

const LIST_WIDTH = 300;

const BelisMapLibWrapper = ({ mapSizes }) => {
  const dispatch: AppDispatch = useDispatch();
  const { selectedFeature } = useMapSelection();

  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);

  // Sync selection to Redux store when map selection changes
  useEffect(() => {
    if (selectedFeature) {
      dispatch(setSelectedFeature({ ...selectedFeature, selected: true }));
    }
  }, [selectedFeature, dispatch]);

  const libreLayers = useMemo(() => {
    const layers: LibreLayer[] = [];

    // Background layer (single active, may be a composite of multiple sub-layers)
    const bgConfig = backgroundLayerConfigs[activeBackgroundLayer];
    if (bgConfig) {
      const bgOpacity = backgroundLayerOpacities[activeBackgroundLayer] ?? 1;
      const bgLayers = Array.isArray(bgConfig.layer)
        ? bgConfig.layer
        : [bgConfig.layer];
      for (const l of bgLayers) {
        const withOpacity = { ...l, opacity: bgOpacity };
        layers.push(withOpacity as LibreLayer);
      }
    }

    // Additional layers (multiple can be active)
    for (const key of activeAdditionalLayers) {
      const addConfig = additionalLayerConfigs[key];
      if (addConfig) {
        const addOpacity = additionalLayerOpacities[key] ?? 1;
        const addLayers = Array.isArray(addConfig.layer)
          ? addConfig.layer
          : [addConfig.layer];
        for (const l of addLayers) {
          const withOpacity = { ...l, opacity: addOpacity };
          layers.push(withOpacity as LibreLayer);
        }
      }
    }

    // Data layer (always on)
    layers.push(leuchtenDataLayer);

    return layers;
  }, [
    activeBackgroundLayer,
    backgroundLayerOpacities,
    activeAdditionalLayers,
    additionalLayerOpacities,
  ]);

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
          backgroundLayers=""
          terrainControl={false}
          fullScreenControl={false}
          libreLayers={libreLayers}
        />
      </div>
    </div>
  );
};

export default BelisMapLibWrapper;
