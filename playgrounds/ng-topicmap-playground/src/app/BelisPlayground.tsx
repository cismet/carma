import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  CarmaMap,
  FeatureDataView,
  DatasheetLayout,
} from "@carma-mapping/core";
import { CustomCard } from "./CustomCard";
import { BelisSwitch } from "@carma-appframeworks/belis";
import {
  useMapSelection,
  useLibreContext,
  LibreContextProvider,
  DatasheetProvider,
  useDatasheet,
  useDatasheetMiniMap,
} from "@carma-mapping/engines/maplibre";
import {
  useVisibleMapFeatures,
  type VisibleFeature,
} from "@carma-mapping/utils";
import type maplibregl from "maplibre-gl";
import { slugifyUrl } from "@carma-mapping/engines/maplibre";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";

// Convert ALL CAPS to Title Case
const toTitleCase = (str: string): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("-")
    )
    .join(" ");
};

const getFeatureLabel = (feature: VisibleFeature): string => {
  const p = feature.properties || {};
  const leuchttyp = p.leuchtentyp || p.leuchttyp || "";
  const nummer = p.leuchtennummer || p.lfd_nummer || "";
  if (leuchttyp || nummer) {
    return `${leuchttyp}-${nummer}`;
  }
  const name = p.name || p.bezeichnung || p.title || "";
  if (name) return name;
  return `ID: ${feature.id ?? "?"}`;
};

const getFeatureStreet = (feature: VisibleFeature): string => {
  const p = feature.properties || {};
  return toTitleCase(p.strasse || p.strassenschluessel || "");
};

/**
 * Minimal sidebar list that exercises the MapSelectionContext.
 * Clicking an item calls selectFeature(); clicking on the map updates the highlight here.
 */
const TestSelectionList = ({
  searchFilter,
}: {
  searchFilter?: string | null;
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const { map } = useLibreContext();
  const { selectedFeatureId, selectFeature } = useMapSelection();

  const [containerSize, setContainerSize] = useState({
    width: 600,
    height: 400,
  });

  useEffect(() => {
    const updateSize = () => {
      setContainerSize({
        width: window.innerWidth - 320,
        height: window.innerHeight - 100,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const { features, totalCount, isLoading, isOverviewMode } =
    useVisibleMapFeatures({
      maplibreMap: map,
      visibleMapWidth: containerSize.width,
      visibleMapHeight: containerSize.height,
      minZoomForFullFeatures: 17,
      maxFeatures: 2000,
      //layerFilterExpressions: ["Leuchten.leitungen-base"],
      layerFilterExpressions: ["Leuchten.*-base", "Leuchten.*-icon"],
    });

  // Filter features by search criteria when highlighting is active
  const filteredFeatures = useMemo(() => {
    if (!searchFilter) return features;
    const regex = new RegExp(searchFilter, "i");
    return features.filter((f) => {
      const val = String(f.properties?.strassenschluessel ?? "");
      return regex.test(val);
    });
  }, [features, searchFilter]);

  // Group features by sourceLayer
  const groupedFeatures = useMemo(() => {
    const groups: Record<string, VisibleFeature[]> = {};
    for (const f of filteredFeatures) {
      const key = f.sourceLayer || f.source || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    }
    return groups;
  }, [filteredFeatures]);

  const isSelected = (feature: VisibleFeature): boolean => {
    if (!selectedFeatureId) return false;
    return (
      selectedFeatureId.source === feature.source &&
      selectedFeatureId.sourceLayer === feature.sourceLayer &&
      selectedFeatureId.id === feature.id
    );
  };

  const handleClick = (feature: VisibleFeature) => {
    selectFeature(
      {
        source: feature.source,
        sourceLayer: feature.sourceLayer,
        id: feature.id,
      },
      feature
    );
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedFeatureId]);

  return (
    <div
      ref={listRef}
      className="w-[300px] h-full bg-white border-r border-gray-300 flex flex-col overflow-hidden shrink-0"
    >
      <div className="px-3 py-2 border-b border-gray-300 bg-gray-50 font-bold text-sm flex justify-between items-center">
        <span>
          Objekte ({searchFilter ? filteredFeatures.length : totalCount})
        </span>
        {isLoading && <span className="text-xs text-gray-500">...</span>}
        {isOverviewMode && !isLoading && (
          <span className="text-[10px] text-gray-400">zoom in</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {totalCount === 0 && !isLoading ? (
          <div className="p-4 text-gray-500 text-center text-sm">
            {map
              ? "Keine Objekte im Kartenausschnitt"
              : "Karte wird geladen..."}
          </div>
        ) : (
          Object.entries(groupedFeatures).map(([groupKey, items]) => (
            <div key={groupKey}>
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <b className="text-sm">{toTitleCase(groupKey)}</b>
                <span className="bg-gray-500 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                  {items.length}
                </span>
              </div>
              {!isOverviewMode &&
                items.map((feature, idx) => {
                  const selected = isSelected(feature);
                  return (
                    <div
                      key={`${feature.source}-${feature.sourceLayer}-${feature.id}-${idx}`}
                      ref={selected ? selectedItemRef : null}
                      onClick={() => handleClick(feature)}
                      className={`px-3 py-2 pl-4 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                        selected
                          ? "bg-blue-50 border-l-2 border-l-blue-500"
                          : ""
                      }`}
                    >
                      <div className="flex justify-between gap-2 overflow-hidden">
                        <span className="shrink-0 whitespace-nowrap text-sm font-semibold">
                          {getFeatureLabel(feature)}
                        </span>
                        <span className="grow text-right whitespace-nowrap text-ellipsis overflow-hidden text-sm text-gray-700">
                          {getFeatureStreet(feature)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const BELIS_LAYERS = [
  {
    type: "vector" as const,
    name: "Leuchten",
    style: "https://tiles.cismet.de/belis/styleX.json",
  },
];

/** Debug flag: translucent main map + red mini-map border, mini-map always visible */
const MINI_MAP_DEBUGGING = false;

const BELIS_STYLE_URL = "https://tiles.cismet.de/belis/styleX.json";
const BELIS_ORIGINAL_SOURCE = "belis-source";
const BELIS_SOURCE_LAYERS = [
  "leuchten",
  "mast",
  "mauerlaschen",
  "schaltstelle",
];

type MapWithGlobalState = maplibregl.Map & {
  setGlobalStateProperty(key: string, value: unknown): void;
};

const BelisPlaygroundContent = () => {
  const { map } = useLibreContext();
  const { selectedFeature, rawFeature } = useMapSelection();
  const { isDatasheetOpen, closeDatasheet } = useDatasheet();
  const [miniMap, setMiniMap] = useState<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [searchText, setSearchText] = useState("00026");
  const [highlightingActive, setHighlightingActive] = useState(false);
  const searchCriteriaRef = useRef<string | null>(null);
  const sourceListenerRef = useRef<(() => void) | null>(null);

  const namespacedSource = `${slugifyUrl(
    BELIS_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;

  const applyHighlights = useCallback(
    (mapInst: maplibregl.Map, searchStr: string) => {
      const regex = new RegExp(searchStr, "i");
      console.log("[BELIS-HL] applyHighlights called", {
        searchStr,
        namespacedSource,
      });
      const allSources = Object.keys(mapInst.getStyle().sources ?? {});
      console.log("[BELIS-HL] available sources:", allSources);
      let totalFeatures = 0;
      let totalMatches = 0;
      for (const sourceLayer of BELIS_SOURCE_LAYERS) {
        const features = mapInst.querySourceFeatures(namespacedSource, {
          sourceLayer,
        });
        console.log("[BELIS-HL]", sourceLayer, "features:", features.length);
        if (features.length > 0) {
          const sample = features[0];
          console.log(
            "[BELIS-HL]",
            sourceLayer,
            "sample props:",
            sample.properties
          );
        }
        for (const f of features) {
          if (f.id == null) continue;
          totalFeatures++;
          const val = String(f.properties?.strassenschluessel ?? "");
          const matches = regex.test(val);
          if (matches) {
            totalMatches++;
            mapInst.setFeatureState(
              { source: namespacedSource, sourceLayer, id: f.id },
              { highlighted: true }
            );
          }
        }
      }
      console.log(
        "[BELIS-HL] total features with id:",
        totalFeatures,
        "matches:",
        totalMatches
      );
    },
    [namespacedSource]
  );

  const handleSearch = useCallback(() => {
    console.log("[BELIS-HL] handleSearch called", { map: !!map, searchText });
    if (!map || !searchText.trim()) return;
    const m = map as MapWithGlobalState;

    // Enable highlighting mode
    m.setGlobalStateProperty("highlightingEnabled", true);
    setHighlightingActive(true);
    searchCriteriaRef.current = searchText.trim();
    console.log(
      "[BELIS-HL] highlighting enabled, criteria set to:",
      searchCriteriaRef.current
    );

    // Apply to currently loaded features
    applyHighlights(map, searchText.trim());

    // Listen for new tiles
    if (sourceListenerRef.current) sourceListenerRef.current();
    const handler = () => {
      if (searchCriteriaRef.current) {
        applyHighlights(map, searchCriteriaRef.current);
      }
    };
    map.on("sourcedata", handler);
    sourceListenerRef.current = () => map.off("sourcedata", handler);
  }, [map, searchText, applyHighlights]);

  const handleClearSearch = useCallback(() => {
    if (!map) return;
    const m = map as MapWithGlobalState;

    // Clear feature states
    for (const sourceLayer of BELIS_SOURCE_LAYERS) {
      const features = map.querySourceFeatures(namespacedSource, {
        sourceLayer,
      });
      for (const f of features) {
        if (f.id == null) continue;
        map.setFeatureState(
          { source: namespacedSource, sourceLayer, id: f.id },
          { highlighted: false }
        );
      }
    }

    m.setGlobalStateProperty("highlightingEnabled", false);
    setHighlightingActive(false);
    searchCriteriaRef.current = null;
    sourceListenerRef.current?.();
    sourceListenerRef.current = null;
    setSearchText("");
  }, [map, namespacedSource]);

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

  const handleReturnToMap = useCallback(() => {
    map?.resize();
  }, [map]);

  const handleMiniMapReady = useCallback((m: maplibregl.Map) => {
    setMiniMap(m);
  }, []);

  return (
    <div className="bg-[#F1F1F1] flex flex-col w-full h-screen overflow-hidden">
      <div className="flex items-center mx-3 mb-2 mt-2 gap-4">
        <span className="font-semibold mr-8 text-lg">BelISDesktop</span>
      </div>
      <div className="w-full flex-1 flex min-h-0">
        <TestSelectionList
          searchFilter={highlightingActive ? searchCriteriaRef.current : null}
        />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mx-3 my-2 flex-1 flex flex-col min-h-0">
            <CustomCard
              title={isDatasheetOpen ? "Datenblatt" : "Karte"}
              style={{ flex: 1, minHeight: 0 }}
              extra={
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Strassenschluessel..."
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={!searchText.trim()}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      Suche
                    </button>
                    {highlightingActive && (
                      <button
                        onClick={handleClearSearch}
                        className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                      >
                        {"\u2715"}
                      </button>
                    )}
                  </div>
                  <BelisSwitch
                    preLabel="Fokus"
                    switched={false}
                    stateChanged={(switched) => {}}
                  />
                  <BelisSwitch
                    id="pale-toggle"
                    preLabel="Blass"
                    switched={false}
                    stateChanged={(switched) => {}}
                  />
                </div>
              }
            >
              <div
                ref={mapContainerRef}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
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
                      exposeMapToWindow
                      miniMap
                      layerMode="imperative"
                      backgroundLayers="basemap_relief@60"
                      overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                      libreLayers={BELIS_LAYERS}
                      setLibreMap={handleMiniMapReady}
                    />
                  </LibreContextProvider>
                </div>
                <DatasheetLayout
                  mainMap={
                    <CarmaMap
                      mapEngine="maplibre"
                      embedded
                      exposeMapToWindow
                      layerMode="imperative"
                      debugLog
                      terrainControl={false}
                      backgroundLayers="basemap_grey@20"
                      overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                      libreLayers={BELIS_LAYERS}
                    />
                  }
                  datasheetContent={
                    <div style={{ height: "100%", overflow: "auto" }}>
                      <FeatureDataView
                        feature={selectedFeature}
                        rawFeature={rawFeature}
                      />
                    </div>
                  }
                  mapOpacity={MINI_MAP_DEBUGGING ? 0.5 : 1}
                  onReturnToMap={handleReturnToMap}
                />
              </div>
            </CustomCard>
          </div>
        </div>
      </div>
    </div>
  );
};

const BelisPlayground = () => {
  return (
    <DatasheetProvider>
      <BelisPlaygroundContent />
    </DatasheetProvider>
  );
};

export default BelisPlayground;

//Working LibreLayers

// libreLayers={[
//         // --- Background layers for testing ---
//         // RVR
//         {
//           type: "wmts",
//           url: "https://geodaten.metropoleruhr.de/spw2/service",
//           layers: "spw2_light",
//           version: "1.3.0",
//           transparent: true,
//           format: "image/png",
//           tileSize: 512,
//           maxZoom: 26,
//         },
// Liegenschaftskarte (grau)
// {
//   type: "wmts",
//   url: "https://s10222-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/alkis/services",
//   //url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
//   layers: "alkomgw",
//   styles: "default",
//   version: "1.1.1",
//   tileSize: 256,
//   maxZoom: 26,
//   transparent: true,
//   format: "image/png",
//   opacity: 0.5,
// },
// // Liegenschaftskarte (bunt)
// {
//   type: "wmts",
//   url: "https://s10222-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/alkis/services",
//   //url: "http://s10221.wuppertal-intra.de:7098/alkis/services",
//   layers: "alkomf",
//   styles: "default",
//   version: "1.1.1",
//   tileSize: 256,
//   transparent: true,
//   format: "image/png",
//   opacity: 0.5,
// },
// // True Orthofoto
// {
//   type: "wms",
//   url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
//   layers: "GIS-102:trueortho2024",
//   tileSize: 256,
//   transparent: true,
//   maxZoom: 26,
//   format: "image/png",
// },
// Luftbildkarte (SPW2 light Grundriss)
// {
//   type: "wmts",
//   url: "https://geodaten.metropoleruhr.de/spw2/service",
//   layers: "spw2_light_grundriss",
//   version: "1.3.0",
//   transparent: true,
//   format: "image/png",
//   maxZoom: 26,
// },
// // Luftbildkarte (True Ortho underlay)
// {
//   type: "wms",
//   url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
//   layers: "GIS-102:trueortho2024",
//   tileSize: 256,
//   transparent: true,
//   maxZoom: 26,
//   format: "image/png",
// },
// // Luftbildkarte (DOP Overlay)
// {
//   type: "wmts",
//   url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
//   layers: "dop_overlay",
//   version: "1.3.0",
//   format: "image/png",
//   transparent: true,
//   maxZoom: 26,
// },
// Stadtplan (grau)
// {
//   type: "vector",
//   name: "Stadtplan grau",
//   style:
//     "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
//   opacity: 0.5,
// },
// Stadtplan (bunt)
// {
//   type: "vector",
//   name: "Stadtplan bunt",
//   style:
//     "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
//   opacity: 0.5,
// },
//   {
//     type: "vector",
//     name: "Leuchten",
//     style: "https://tiles.cismet.de/belis/style.json",
//     opacity: 1,
//   },
// ]}
