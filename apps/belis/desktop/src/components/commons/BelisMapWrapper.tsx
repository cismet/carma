import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { CarmaMap, DatasheetLayout } from "@carma-mapping/core";
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
import {
  useMapSelection,
  useLibreContext,
  LibreContextProvider,
  useDatasheet,
  useDatasheetMiniMap,
} from "@carma-mapping/engines/maplibre";
import type maplibregl from "maplibre-gl";
import BelisDatasheetView from "../ui/BelisDatasheetView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { getJWT } from "../../store/slices/auth";
import { FeatureType, fetchFeatureById } from "../../helper/apiMethods";

const LIST_WIDTH = 300;

/** Debug flag: translucent main map + red mini-map border, mini-map always visible */
const MINI_MAP_DEBUGGING = false;

const BelisMapLibWrapper = ({ mapSizes }) => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const { map } = useLibreContext();
  const { selectedFeature, rawFeature, selectedFeatureId } = useMapSelection();
  const { closeDatasheet } = useDatasheet();
  const [fetchedFeatureData, setFetchedFeatureData] = useState<any>(null);

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

  // Mini-map state
  const [miniMap, setMiniMap] = useState<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const {
    containerStyle,
    debugOutlineStyle,
    showCloseButton,
    miniMapContainerRef,
  } = useDatasheetMiniMap({
    mainMap: map,
    miniMap,
    containerRef: mapContainerRef,
    debug: MINI_MAP_DEBUGGING,
  });

  const handleMiniMapReady = useCallback((m: maplibregl.Map) => {
    setMiniMap(m);
  }, []);

  const handleReturnToMap = useCallback(() => {
    map?.resize();
  }, [map]);

  const mapWidth = mapSizes.width - LIST_WIDTH;

  useEffect(() => {
    const fetchData = async () => {
      if (!jwt || !selectedFeatureId?.id) {
        setFetchedFeatureData(null);
        return;
      }

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
          // Pass full data - forms will extract what they need internally
          setFetchedFeatureData(fullData);
        } catch (error) {
          console.error("xxx Failed to fetch feature:", error);
          setFetchedFeatureData(null);
        }
      }
    };

    fetchData();
  }, [selectedFeatureId, jwt]);

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      <OnMapList
        visibleMapWidth={mapWidth}
        visibleMapHeight={mapSizes.height}
      />
      <div
        ref={mapContainerRef}
        style={{
          position: "relative",
          width: mapWidth,
          height: mapSizes.height,
          overflow: "hidden",
        }}
      >
        {debugOutlineStyle && <div style={debugOutlineStyle} />}
        <div ref={miniMapContainerRef} style={containerStyle}>
          {showCloseButton && (
            <button
              onClick={closeDatasheet}
              title="Zur Karte"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                zIndex: 10,
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "none",
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <FontAwesomeIcon icon={faMap} />
            </button>
          )}
          <LibreContextProvider>
            <CarmaMap
              mapEngine="maplibre"
              embedded
              miniMap
              overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
              backgroundLayers="basemap_grey@60"
              layerMode="imperative"
              libreLayers={[leuchtenDataLayer]}
              setLibreMap={handleMiniMapReady}
            />
          </LibreContextProvider>
        </div>
        <DatasheetLayout
          mainMap={
            <CarmaMap
              mapEngine="maplibre"
              layerMode="imperative"
              embedded
              debugLog
              overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
              backgroundLayers=""
              terrainControl={false}
              fullScreenControl={false}
              libreLayers={libreLayers}
            />
          }
          datasheetContent={
            <div style={{ height: "100%", overflow: "auto" }}>
              <BelisDatasheetView
                feature={selectedFeature}
                rawFeature={rawFeature}
                fetchedData={fetchedFeatureData}
                featureType={selectedFeatureId?.sourceLayer}
              />
            </div>
          }
          onReturnToMap={handleReturnToMap}
        />
      </div>
    </div>
  );
};

export default BelisMapLibWrapper;
