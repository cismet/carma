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
import BelisSidebar from "../ui/BelisSidebar";
import { useVisibleMapFeatures, functionToInfo } from "@carma-mapping/utils";
import { extractCarmaConfig } from "@carma-commons/utils";
import {
  useMapSelection,
  useLibreContext,
  LibreContextProvider,
  useDatasheet,
  useDatasheetMiniMap,
  useMapHighlighting,
  useMapHighlight,
  useSelectionNeighborhood,
  slugifyUrl,
} from "@carma-mapping/engines/maplibre";
import type maplibregl from "maplibre-gl";
import BelisDatasheetView from "../ui/BelisDatasheetView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { FeatureType, fetchFeatureById } from "../../helper/apiMethods";
import { getJWT } from "../../store/slices/auth";
import { flattenGqlRecord } from "../../helper/flattenGqlRecord";

const LIST_WIDTH = 300;

/** Debug flag: translucent main map + red mini-map border, mini-map always visible */
const MINI_MAP_DEBUGGING = false;


import type { SidebarFeature } from "../ui/BelisSidebar";

type SidebarMode = "karte" | "suche";

interface BelisMapLibWrapperProps {
  mapSizes: { width: number; height: number };
  activeSourceLayers: Set<string>;
  searchResults: SidebarFeature[] | null;
}

const BelisMapLibWrapper = ({
  mapSizes,
  activeSourceLayers,
  searchResults,
}: BelisMapLibWrapperProps) => {
  const dispatch: AppDispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const { map } = useLibreContext();
  const { selectedFeature, rawFeature, selectedFeatureId, selectFeature } = useMapSelection();
  const { closeDatasheet, openDatasheet } = useDatasheet();
  const [fetchedFeatureData, setFetchedFeatureData] = useState<any>(null);
  // Preserve last valid featureType to prevent unmount when selectedFeature briefly becomes undefined
  const [lastFeatureType, setLastFeatureType] = useState<string | undefined>(undefined);

  // Extract the infoboxMapping code from the style (browser-cached, no extra network cost)
  const [infoboxMappingCode, setInfoboxMappingCode] = useState<string | null>(null);
  useEffect(() => {
    fetch(BELIS_STYLE_URL)
      .then((r) => r.json())
      .then((styleJson) => {
        const keywords = styleJson.metadata?.carmaConf?.layerInfo?.keywords;
        if (keywords && Array.isArray(keywords)) {
          const config = extractCarmaConfig(keywords);
          if (config?.infoboxMapping && Array.isArray(config.infoboxMapping)) {
            // Join mapping lines; for function-style, there's typically one entry
            const code = config.infoboxMapping.join("\n");
            setInfoboxMappingCode(code);
          }
        }
      })
      .catch((err) => console.warn("[INFOBOX] Failed to extract mapping from style:", err));
  }, []);
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

  // Adjusted search results: starts from searchResults, updated by Alt+click toggles
  const [adjustedSearchResults, setAdjustedSearchResults] = useState<SidebarFeature[] | null>(searchResults);
  // Reset when a new search arrives
  useEffect(() => {
    setAdjustedSearchResults(searchResults);
  }, [searchResults]);

  const handleHighlightToggle = useCallback(
    (feature: maplibregl.MapGeoJSONFeature) => {
      setAdjustedSearchResults((prev) => {
        const toSidebarFeature = (f: maplibregl.MapGeoJSONFeature): SidebarFeature =>
          Object.assign(f, { original: f }) as unknown as SidebarFeature;

        if (!prev) {
          // No search results yet: create a list with just the toggled feature
          return [toSidebarFeature(feature)];
        }
        const dbId = String(feature.properties?.id ?? feature.id ?? "");
        const sl = feature.sourceLayer ?? "";
        const idx = prev.findIndex(
          (f) =>
            (f.sourceLayer ?? "") === sl &&
            String(f.properties?.id ?? f.id ?? "") === dbId
        );
        if (idx >= 0) {
          // Remove it
          return prev.filter((_, i) => i !== idx);
        }
        // Add it
        return [...prev, toSidebarFeature(feature)];
      });
    },
    []
  );

  useMapHighlighting({
    map,
    sources: highlightSources,
    modifierClick: "alt",
    onToggle: handleHighlightToggle,
  });

  // Sidebar data: highlight state + visible features
  const { highlightingActive, highlightVersion } = useMapHighlight();

  const showRaw = useMemo(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const param = new URLSearchParams(hashQuery || window.location.search).get("showRaw");
    if (param !== null) return param === "true";
    return window.location.hostname === "localhost";
  }, []);

  const mapWidth = mapSizes.width - LIST_WIDTH;

  const { features, totalCount, countsByLayer, isLoading, isOverviewMode } =
    useVisibleMapFeatures({
      maplibreMap: map,
      visibleMapWidth: mapWidth,
      visibleMapHeight: mapSizes.height,
      maxFeatures: 2000,
      layerFilterExpressions: ["Leuchten.*-base", "Leuchten.*-icon", "Standorte.*-base", "Standorte.*-icon", "standorte.*"],
      highlightedOnly: highlightingActive,
      refreshTrigger: highlightVersion,
      showDebugBounds: showRaw,
    });

  // Sidebar mode: "karte" shows viewport features, "suche" shows search results
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("karte");

  // When highlighting is killed, reset to Karte mode and clear search collection
  useEffect(() => {
    if (!highlightingActive) {
      setSidebarMode("karte");
      setAdjustedSearchResults(null);
    }
  }, [highlightingActive]);

  const hasSearchResults = adjustedSearchResults != null && adjustedSearchResults.length > 0;


  // Compute effective sidebar data based on mode
  const effectiveSidebarData = useMemo(() => {
    if (sidebarMode === "suche" && adjustedSearchResults && adjustedSearchResults.length > 0) {
      // Derive countsByLayer from search results
      const counts: Record<string, number> = {};
      for (const f of adjustedSearchResults) {
        const sl = f.sourceLayer || "";
        counts[sl] = (counts[sl] || 0) + 1;
      }
      const total = adjustedSearchResults.length;
      // Include all layers present in results
      const layers = new Set([...activeSourceLayers, ...Object.keys(counts)]);
      return {
        features: adjustedSearchResults,
        countsByLayer: counts,
        totalCount: total,
        isLoading: false,
        isOverviewMode: false,
        activeSourceLayers: layers,
      };
    }
    return {
      features,
      countsByLayer,
      totalCount,
      isLoading,
      isOverviewMode,
      activeSourceLayers,
    };
  }, [sidebarMode, adjustedSearchResults, features, countsByLayer, totalCount, isLoading, isOverviewMode, activeSourceLayers]);

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
      const NEIGHBORHOOD_LAYERS = new Set(["leuchten", "standorte"]);
      if (
        !NEIGHBORHOOD_LAYERS.has(selectedSourceLayer ?? "") ||
        !NEIGHBORHOOD_LAYERS.has(candidateSourceLayer ?? "")
      )
        return false;

      // Resolve the standort ID for selected and candidate
      const selectedStandortId =
        selectedSourceLayer === "standorte"
          ? String(selectedProps.id ?? "")
          : String(selectedProps.fk_standort ?? "");
      const candidateStandortId =
        candidateSourceLayer === "standorte"
          ? String(candidateProps.id ?? "")
          : String(candidateProps.fk_standort ?? "");

      return (
        selectedStandortId !== "" &&
        candidateStandortId !== "" &&
        selectedStandortId === candidateStandortId
      );
    },
  });

  // Sync selection to Redux store when map selection changes
  useEffect(() => {
    if (selectedFeature) {
      dispatch(setSelectedFeature({ ...selectedFeature, selected: true }));
    }
  }, [selectedFeature, dispatch]);

  // Map source layer names to FeatureType for API fetches
  const SOURCE_LAYER_TO_FEATURE_TYPE: Record<string, FeatureType> = {
    leuchten: "leuchten",
    standorte: "mast",
    schaltstelle: "schaltstelle",
    mauerlaschen: "mauerlaschen",
    leitungen: "leitungen",
    abzweigdosen: "abzweigdosen",
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!jwt) return;

      // Resolve sourceLayer + id from either the processed feature or the raw selection identifier
      let sourceLayer: string | undefined;
      let featureId: string | number | undefined;

      if (selectedFeature) {
        sourceLayer = selectedFeature.carmaInfo?.sourceLayer;
        featureId = selectedFeature.properties?.sourceProps?.id;
      } else if (selectedFeatureId) {
        // Fallback: LibreMap couldn't process the feature (e.g. search result not on map)
        sourceLayer = selectedFeatureId.sourceLayer;
        featureId = selectedFeatureId.id;
      } else {
        setFetchedFeatureData(null);
        return;
      }

      if (sourceLayer) {
        setLastFeatureType(sourceLayer);
      }

      console.log("[SELECTION] vector feature:", {
        featureId,
        sourceLayer,
        rawFeature,
        fallback: !selectedFeature,
      });

      const apiFeatureType = SOURCE_LAYER_TO_FEATURE_TYPE[sourceLayer ?? ""];
      if (!apiFeatureType || !featureId) {
        // Not a known BeLIS layer (e.g. ALKIS background); clear stale data
        setFetchedFeatureData(null);
        return;
      }
      dispatch(setFeatureLoading(true));
      try {
        const fullData = await fetchFeatureById(
          jwt,
          featureId as number,
          apiFeatureType
        );
        setFetchedFeatureData(fullData);
      } catch (error) {
        console.error("[SELECTION] Failed to fetch feature:", error);
        setFetchedFeatureData(null);
      } finally {
        dispatch(setFeatureLoading(false));
      }
    };

    fetchData();
  }, [selectedFeature, selectedFeatureId, jwt]);

  // Build override feature for the infobox when LibreMap can't process the selection
  // (e.g. search result not visible on map).
  // Flatten the GraphQL by-id record to vector-tile-like props, then run the same
  // createInfoBoxInfo.js (from the style) via sandboxed eval.
  const [overrideSelectedFeature, setOverrideSelectedFeature] = useState<any>(null);
  useEffect(() => {
    const sourceLayer = selectedFeatureId?.sourceLayer ?? "";
    if (
      selectedFeature ||
      !fetchedFeatureData ||
      !selectedFeatureId ||
      !infoboxMappingCode ||
      !SOURCE_LAYER_TO_FEATURE_TYPE[sourceLayer]
    ) {
      setOverrideSelectedFeature(null);
      return;
    }

    (async () => {
      try {
        // Unwrap GraphQL envelope: { schaltstelle: [{...}] } -> record
        const firstArray = Object.values(fetchedFeatureData).find(Array.isArray) as unknown[] | undefined;
        const record = (firstArray?.[0] ?? null) as Record<string, any> | null;
        if (!record) { setOverrideSelectedFeature(null); return; }

        // Flatten to vector-tile-like props so createInfoBoxInfo.js can process them
        const flatProps = flattenGqlRecord(record, sourceLayer);

        // Run the same mapping function that LibreMap uses for on-map clicks
        const info = await functionToInfo(
          { ...flatProps, carmaInfo: { sourceLayer } },
          infoboxMappingCode
        );

        if (info) {
          const genericLinks: { iconname: string; tooltip: string; action?: () => void }[] = [];
          if ((info as Record<string, unknown>).datasheet && openDatasheet) {
            genericLinks.push({
              iconname: "info",
              tooltip: "Datenblatt",
              action: openDatasheet,
            });
          }
          setOverrideSelectedFeature({
            properties: { ...info, sourceProps: fetchedFeatureData, genericLinks },
            geometry: rawFeature?.geometry ?? { type: "Point", coordinates: [0, 0] },
            carmaInfo: { sourceLayer },
          });
        } else {
          setOverrideSelectedFeature(null);
        }
      } catch {
        setOverrideSelectedFeature(null);
      }
    })();
  }, [selectedFeature, fetchedFeatureData, selectedFeatureId, infoboxMappingCode, rawFeature]);

  // Visually select the MVT feature on the map when using the override path.
  // The override path means LibreMap didn't handle the selection (no on-map click),
  // so we need to set feature-state { selected: true } ourselves.
  // Retry on sourcedata because the tile may not be loaded yet (e.g. after fly-to).
  useEffect(() => {
    if (!map || !overrideSelectedFeature || !selectedFeatureId) return;

    const sourceLayer = selectedFeatureId.sourceLayer ?? "";
    const dbId = selectedFeatureId.id;
    if (dbId == null) return;

    let prevMvtId: string | number | undefined;

    const trySelect = () => {
      try {
        const features = map.querySourceFeatures(namespacedSource, { sourceLayer });
        const match = features.find(
          (f) => f.properties && String(f.properties.id) === String(dbId)
        );
        if (match?.id != null) {
          if (prevMvtId != null && prevMvtId !== match.id) {
            map.setFeatureState(
              { source: namespacedSource, sourceLayer, id: prevMvtId },
              { selected: false }
            );
          }
          map.setFeatureState(
            { source: namespacedSource, sourceLayer, id: match.id },
            { selected: true }
          );
          prevMvtId = match.id;
        }
      } catch {
        // source/layer may not exist yet
      }
    };

    trySelect();
    map.on("sourcedata", trySelect);

    return () => {
      map.off("sourcedata", trySelect);
      if (prevMvtId != null) {
        try {
          map.setFeatureState(
            { source: namespacedSource, sourceLayer, id: prevMvtId },
            { selected: false }
          );
        } catch {
          // ignore
        }
      }
    };
  }, [map, overrideSelectedFeature, selectedFeatureId, namespacedSource]);

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

  // Database primary key of the selected feature (from tile properties).
  // MVT feature IDs differ from database PKs; Suche mode uses database PKs.
  const selectedDatabaseId = useMemo(() => {
    return (
      selectedFeature?.properties?.sourceProps?.id ??
      rawFeature?.properties?.id ??
      null
    );
  }, [selectedFeature, rawFeature]);

  // Always pass the raw feature so the mini-map can center on its geometry.
  // LibreMap's createFeature() won't fire because the namespaced source
  // (slugifyUrl::originalSource) doesn't match any mapping key (slugifyUrl only).
  // The setSelectedFeature(null) in LibreMap's watcher ensures the override path works.
  const handleSidebarFeatureSelect = useCallback(
    (
      identifier: { source: string; sourceLayer?: string; id?: string | number },
      feature: SidebarFeature
    ) => {
      selectFeature(identifier, feature as any);
    },
    [selectFeature]
  );

  return (
    <div
      className="relative flex"
      style={{ width: mapSizes.width, height: mapSizes.height }}
    >
      <BelisSidebar
        features={effectiveSidebarData.features}
        countsByLayer={effectiveSidebarData.countsByLayer}
        totalCount={effectiveSidebarData.totalCount}
        isLoading={effectiveSidebarData.isLoading}
        isOverviewMode={effectiveSidebarData.isOverviewMode}
        activeSourceLayers={effectiveSidebarData.activeSourceLayers}
        selectedFeatureId={selectedFeatureId}
        selectedDatabaseId={selectedDatabaseId}
        onFeatureSelect={handleSidebarFeatureSelect}
        emptyMessage={
          map
            ? "Keine Objekte im aktuellen Kartenausschnitt"
            : "Karte wird geladen..."
        }
        sidebarMode={sidebarMode}
        onModeChange={setSidebarMode}
        hasSearchResults={hasSearchResults}
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
              logErrors={showRaw}
              exposeMapToWindow
              overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
              backgroundLayers=""
              terrainControl={false}
              fullScreenControl={false}
              libreLayers={libreLayers}
              selectFromHits={handleSelectFromHits}
              overrideSelectedFeature={overrideSelectedFeature}
              gazetteerInfoOnClick={false}
            />
          }
          datasheetContent={
            <div style={{ height: "100%", overflow: "hidden" }}>
              <BelisDatasheetView
                feature={selectedFeature}
                rawFeature={rawFeature}
                fetchedData={fetchedFeatureData}
                featureType={selectedFeature?.carmaInfo?.sourceLayer || selectedFeatureId?.sourceLayer || lastFeatureType}
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
