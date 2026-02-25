import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { CarmaMap, DatasheetLayout } from "@carma-mapping/core";
import { useDispatch, useSelector } from "react-redux";
import {
  setSelectedFeature,
  setFeatureLoading,
} from "../../store/slices/featureCollection";
import {
  getActiveBackgroundLayer,
  getBackgroundLayerOpacities,
  getActiveAdditionalLayers,
  getAdditionalLayerOpacities,
  isInPaleMode,
} from "../../store/slices/mapSettings";
import {
  backgroundLayerConfigs,
  additionalLayerConfigs,
  leuchtenDataLayer,
  BELIS_STYLE_URL,
  BELIS_ORIGINAL_SOURCE,
  BELIS_SOURCE_LAYERS,
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
  useMapHighlighting,
  useSelectionNeighborhood,
  slugifyUrl,
} from "@carma-mapping/engines/maplibre";
import type maplibregl from "maplibre-gl";
import BelisDatasheetView from "../ui/BelisDatasheetView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FeatureType, fetchFeatureById } from "../../helper/apiMethods";
import { getJWT } from "../../store/slices/auth";

const LIST_WIDTH = 300;

/** Debug flag: translucent main map + red mini-map border, mini-map always visible */
const MINI_MAP_DEBUGGING = false;

interface BelisMapLibWrapperProps {
  mapSizes: { width: number; height: number };
  activeSourceLayers: Set<string>;
}

const BelisMapLibWrapper = ({
  mapSizes,
  activeSourceLayers,
}: BelisMapLibWrapperProps) => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const { map } = useLibreContext();
  const { selectedFeature, rawFeature } = useMapSelection();
  const { closeDatasheet } = useDatasheet();
  const [fetchedFeatureData, setFetchedFeatureData] = useState<any>(null);
  // Preserve last valid featureType to prevent unmount when selectedFeature briefly becomes undefined
  const [lastFeatureType, setLastFeatureType] = useState<string | undefined>(undefined);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  const inPaleMode = useSelector(isInPaleMode);

  // Highlighting: compute namespaced source + call useMapHighlighting
  const namespacedSource = `${slugifyUrl(
    BELIS_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;
  const highlightSources = useMemo(
    () => [
      { source: namespacedSource, sourceLayers: [...BELIS_SOURCE_LAYERS] },
    ],
    [namespacedSource]
  );

  useMapHighlighting({
    map,
    sources: highlightSources,
    modifierClick: "alt",
  });

  // Neighborhood: mark leuchten sharing the same Standort as the selected feature
  useSelectionNeighborhood({
    map,
    sources: highlightSources,
    isNeighbor: (
      selectedProps,
      candidateProps,
      candidateSourceLayer,
      selectedSourceLayer
    ) => {
      if (
        selectedSourceLayer !== "leuchten" ||
        candidateSourceLayer !== "leuchten"
      )
        return false;
      const selectedStandort = selectedProps.fk_standort;
      const candidateStandort = candidateProps.fk_standort;
      return (
        selectedStandort != null &&
        candidateStandort != null &&
        String(selectedStandort) === String(candidateStandort)
      );
    },
  });

  // Sync selection to Redux store when map selection changes
  useEffect(() => {
    if (selectedFeature) {
      dispatch(setSelectedFeature({ ...selectedFeature, selected: true }));
    }
  }, [selectedFeature, dispatch]);

  const validFeatureTypes: FeatureType[] = [
    "leuchten",
    "mast",
    "schaltstelle",
    "mauerlaschen",
    "leitungen",
    "abzweigdosen",
  ];

  useEffect(() => {
    const fetchData = async () => {
      // Don't clear data when selectedFeature is undefined - keep form mounted with old data
      if (!jwt || !selectedFeature) {
        return;
      }

      // Get sourceLayer from selectedFeature
      const sourceLayer = selectedFeature?.carmaInfo?.sourceLayer;

      // Preserve featureType for when selectedFeature briefly becomes undefined
      if (sourceLayer) {
        setLastFeatureType(sourceLayer);
      }
      const featureId = selectedFeature?.properties?.sourceProps?.id;

      console.log("[SELECTION] vector feature:", {
        featureId,
        sourceLayer,
        rawFeature,
      });

      const isValidFeatureType =
        typeof sourceLayer === "string" &&
        validFeatureTypes.includes(sourceLayer as FeatureType);

      if (isValidFeatureType && featureId) {
        dispatch(setFeatureLoading(true));
        try {
          const fullData = await fetchFeatureById(
            jwt,
            featureId as number,
            sourceLayer as FeatureType
          );
          console.log("xxx Fetched full data:", fullData);
          // Pass full data - forms will extract what they need internally
          setFetchedFeatureData(fullData);
        } catch (error) {
          console.error("xxx Failed to fetch feature:", error);
          setFetchedFeatureData(null);
        } finally {
          dispatch(setFeatureLoading(false));
        }
      }
    };

    fetchData();
  }, [selectedFeature, jwt]);

  const libreLayers = useMemo(() => {
    const layers: LibreLayer[] = [];

    // Background layer (single active, may be a composite of multiple sub-layers)
    const bgConfig = backgroundLayerConfigs[activeBackgroundLayer];
    if (bgConfig) {
      const bgOpacity = backgroundLayerOpacities[activeBackgroundLayer] ?? 1;
      const effectiveOpacity = inPaleMode ? bgOpacity * 0.1 : bgOpacity;
      const bgLayers = Array.isArray(bgConfig.layer)
        ? bgConfig.layer
        : [bgConfig.layer];
      for (const l of bgLayers) {
        const withOpacity = { ...l, opacity: effectiveOpacity };
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
    inPaleMode,
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

  // Deterministic click selection: prefer leuchten, sort by leuchtennummer
  const handleSelectFromHits = useCallback(
    (hits: maplibregl.MapGeoJSONFeature[]) => {
      const leuchten = hits.filter((h) => h.sourceLayer === "leuchten");
      if (leuchten.length > 0) {
        return leuchten.sort(
          (a, b) =>
            Number(a.properties?.leuchtennummer ?? 0) -
            Number(b.properties?.leuchtennummer ?? 0)
        )[0];
      }
      return hits[0];
    },
    []
  );

  const handleReturnToMap = useCallback(() => {
    map?.resize();
  }, [map]);

  const logErrors = useMemo(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const param = new URLSearchParams(hashQuery || window.location.search).get("showRaw");
    if (param !== null) return param === "true";
    return window.location.hostname === "localhost";
  }, []);

  const mapWidth = mapSizes.width - LIST_WIDTH;

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      <OnMapList
        visibleMapWidth={mapWidth}
        visibleMapHeight={mapSizes.height}
        activeSourceLayers={activeSourceLayers}
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
              logErrors={logErrors}
              exposeMapToWindow
              overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
              backgroundLayers=""
              terrainControl={false}
              fullScreenControl={false}
              libreLayers={libreLayers}
              selectFromHits={handleSelectFromHits}
            />
          }
          datasheetContent={
            <div style={{ height: "100%", overflow: "hidden" }}>
              <BelisDatasheetView
                feature={selectedFeature}
                rawFeature={rawFeature}
                fetchedData={fetchedFeatureData}
                featureType={selectedFeature?.carmaInfo?.sourceLayer || lastFeatureType}
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
