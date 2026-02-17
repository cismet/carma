import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  CarmaMap,
  FeatureDataView,
  DatasheetLayout,
} from "@carma-mapping/core";
import { CustomCard } from "./CustomCard";
import {
  useMapSelection,
  useLibreContext,
  LibreContextProvider,
  DatasheetProvider,
  useDatasheet,
  useDatasheetMiniMap,
  useMapHighlight,
  useMapHighlighting,
  useLayerFilter,
  useSelectionNeighborhood,
  type FilterCategory,
} from "@carma-mapping/engines/maplibre";
import {
  useVisibleMapFeatures,
  type VisibleFeature,
} from "@carma-mapping/utils";
import type maplibregl from "maplibre-gl";
import { slugifyUrl } from "@carma-mapping/engines/maplibre";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";
import { Switch } from "antd";

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

const BELIS_FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: "leuchten",
    label: "Leuchten",
    sourceLayers: ["leuchten"],
    layerPatterns: ["leuchten"],
  },
  {
    key: "masten",
    label: "Masten",
    sourceLayers: ["mast"],
    layerPatterns: ["mast"],
  },
  {
    key: "mauerlaschen",
    label: "Mauerlaschen",
    sourceLayers: ["mauerlaschen"],
    layerPatterns: ["mauerlaschen"],
  },
  {
    key: "leitungen",
    label: "Leitungen",
    sourceLayers: ["leitungen"],
    layerPatterns: ["leitungen"],
  },
  {
    key: "schaltstellen",
    label: "Schaltstellen",
    sourceLayers: ["schaltstelle"],
    layerPatterns: ["schaltstelle"],
  },
  {
    key: "abzweigdosen",
    label: "Abzweigdosen",
    sourceLayers: ["abzweigdosen"],
    layerPatterns: ["abzweigdose"],
  },
];

const TestSelectionList = ({
  activeSourceLayers,
}: {
  activeSourceLayers?: Set<string> | null;
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const { map } = useLibreContext();
  const { selectedFeatureId, selectFeature } = useMapSelection();
  const { highlightingActive, highlightVersion } = useMapHighlight();

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
      maxFeatures: 2000,
      layerFilterExpressions: ["Leuchten.*-base", "Leuchten.*-icon"],
      highlightedOnly: highlightingActive,
      refreshTrigger: highlightVersion,
    });

  // Filter features by active source layers
  const filteredFeatures = useMemo(() => {
    if (!activeSourceLayers) return features;
    return features.filter((f) => {
      const sl = f.sourceLayer || "";
      return activeSourceLayers.has(sl);
    });
  }, [features, activeSourceLayers]);

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

  // Flat ordered list matching render order (for keyboard navigation)
  const flatFeatures = useMemo(() => {
    const flat: VisibleFeature[] = [];
    for (const [, items] of Object.entries(groupedFeatures)) {
      if (!isOverviewMode) flat.push(...items);
    }
    return flat;
  }, [groupedFeatures, isOverviewMode]);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (flatFeatures.length === 0) return;

      const currentIdx = flatFeatures.findIndex((f) => isSelected(f));
      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx =
          currentIdx < 0
            ? 0
            : Math.min(currentIdx + 1, flatFeatures.length - 1);
      } else {
        nextIdx = currentIdx < 0 ? 0 : Math.max(currentIdx - 1, 0);
      }
      const next = flatFeatures[nextIdx];
      selectFeature(
        { source: next.source, sourceLayer: next.sourceLayer, id: next.id },
        next
      );
    },
    [flatFeatures, selectFeature, selectedFeatureId]
  );

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
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="w-[300px] h-full bg-white border-r border-gray-300 flex flex-col overflow-hidden shrink-0 outline-none"
    >
      <div className="px-3 py-2 border-b border-gray-300 bg-gray-50 font-bold text-sm flex justify-between items-center">
        <span>
          Objekte ({highlightingActive ? filteredFeatures.length : totalCount})
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

const BelisPlaygroundContent = () => {
  const { map } = useLibreContext();
  const { selectedFeature, rawFeature } = useMapSelection();
  const { isDatasheetOpen, closeDatasheet } = useDatasheet();
  const [miniMap, setMiniMap] = useState<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [searchText, setSearchText] = useState("00026");

  // Highlighting via context + hook
  const {
    highlightingActive,
    setHighlightingActive,
    highlightByProperty,
    clearHighlights,
  } = useMapHighlight();

  const namespacedSource = `${slugifyUrl(
    BELIS_STYLE_URL
  )}::${BELIS_ORIGINAL_SOURCE}`;
  const BELIS_SOURCE_LAYERS = useMemo(
    () => [
      "leuchten",
      "mast",
      "mauerlaschen",
      "schaltstelle",
      "leitungen",
      "abzweigdosen",
    ],
    []
  );
  const highlightSources = useMemo(
    () => [{ source: namespacedSource, sourceLayers: BELIS_SOURCE_LAYERS }],
    [namespacedSource, BELIS_SOURCE_LAYERS]
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
      const selected = selectedProps.fk_standort;
      const candidate = candidateProps.fk_standort;
      return (
        selected != null &&
        candidate != null &&
        String(selected) === String(candidate)
      );
    },
  });

  // Layer filtering via hook
  const { enabledFilters, setFilterEnabled, activeSourceLayers } =
    useLayerFilter({
      map,
      categories: BELIS_FILTER_CATEGORIES,
    });

  const handleSearch = useCallback(() => {
    if (!map || !searchText.trim()) return;
    setHighlightingActive(true);
    highlightByProperty(
      "strassenschluessel",
      new RegExp(searchText.trim(), "i")
    );
  }, [map, searchText, setHighlightingActive, highlightByProperty]);

  const handleClearSearch = useCallback(() => {
    setHighlightingActive(false);
    clearHighlights();
    setSearchText("");
  }, [setHighlightingActive, clearHighlights]);

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

  return (
    <div className="bg-[#F1F1F1] flex flex-col w-full h-screen overflow-hidden">
      <div className="flex items-center mx-3 mb-2 mt-2 gap-4">
        <span className="font-semibold mr-8 text-lg">BelISDesktop</span>
      </div>
      <div className="w-full flex-1 flex min-h-0">
        <TestSelectionList activeSourceLayers={activeSourceLayers} />
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
                  <div className="flex items-center gap-2 border-l border-gray-300 pl-4 flex-wrap">
                    {BELIS_FILTER_CATEGORIES.map((cat) => (
                      <Switch
                        key={cat.key}
                        checkedChildren={cat.label}
                        unCheckedChildren={cat.label}
                        checked={enabledFilters[cat.key]}
                        onChange={(on) => setFilterEnabled(cat.key, on)}
                      />
                    ))}
                  </div>
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
                      selectFromHits={handleSelectFromHits}
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
