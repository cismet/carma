import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { CarmaMap, FeatureDataView, DatasheetLayout } from "@carma-mapping/core";
import { CustomCard } from "./CustomCard";
import { BelisSwitch } from "@carma-appframeworks/belis";
import {
  useMapSelection,
  useLibreContext,
  DatasheetProvider,
  useDatasheet,
  DatasheetMiniMap,
  getCoordinates,
} from "@carma-mapping/engines/maplibre";
import {
  useVisibleMapFeatures,
  type VisibleFeature,
} from "@carma-mapping/utils";
import type maplibregl from "maplibre-gl";

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
const TestSelectionList = () => {
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

  // Group features by sourceLayer
  const groupedFeatures = useMemo(() => {
    const groups: Record<string, VisibleFeature[]> = {};
    for (const f of features) {
      const key = f.sourceLayer || f.source || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    }
    return groups;
  }, [features]);

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
        <span>Objekte ({totalCount})</span>
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

const BelisPlaygroundContent = () => {
  const { map } = useLibreContext();
  const { selectedFeature, rawFeature } = useMapSelection();
  const { closeDatasheet } = useDatasheet();
  const miniMapRef = useRef<maplibregl.Map | null>(null);

  // Compute mini-map center from the raw feature geometry
  const featureCenter = useMemo((): [number, number] | undefined => {
    if (!rawFeature?.geometry) return undefined;
    const coords = getCoordinates(rawFeature.geometry);
    if (coords.length >= 2) {
      return [coords[0], coords[1]];
    }
    return undefined;
  }, [rawFeature]);

  const getMainMapSnapshot = useCallback(
    () => map?.getCanvas().toDataURL() ?? null,
    [map]
  );

  const getMiniMapSnapshot = useCallback(
    () => miniMapRef.current?.getCanvas().toDataURL() ?? null,
    []
  );

  const handleReturnToMap = useCallback(() => {
    map?.resize();
  }, [map]);

  return (
    <div className="bg-[#F1F1F1] flex flex-col w-full h-screen overflow-hidden">
      <div className="flex items-center mx-3 mb-2 mt-2">
        <span className="font-semibold mr-8 text-lg">BelISDesktop</span>
      </div>
      <div className="w-full flex-1 flex min-h-0">
        <TestSelectionList />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mx-3 my-2 flex-1 flex flex-col min-h-0">
            <CustomCard
              title="Karte"
              style={{ flex: 1, minHeight: 0 }}
              extra={
                <div className="flex items-center gap-4">
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
              <DatasheetLayout
                mainMap={
                  <CarmaMap
                    mapEngine="maplibre"
                    embedded
                    terrainControl={false}
                    preserveDrawingBuffer
                    backgroundLayers="basemap_grey@60"
                    overrideGlyphs="https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf"
                    libreLayers={[
                      {
                        type: "vector",
                        name: "Leuchten",
                        style: "https://tiles.cismet.de/belis/style.json",
                      },
                    ]}
                  />
                }
                datasheetContent={
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 16px",
                        borderBottom: "1px solid #e0e0e0",
                        background: "#f5f5f5",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        Datenblatt
                      </span>
                      <button
                        onClick={closeDatasheet}
                        style={{
                          background: "#1677ff",
                          color: "#fff",
                          border: "none",
                          borderRadius: 4,
                          padding: "4px 12px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        Zur Karte
                      </button>
                    </div>
                    <div style={{ flex: 1, overflow: "auto" }}>
                      <FeatureDataView
                        feature={selectedFeature}
                        rawFeature={rawFeature}
                      />
                    </div>
                  </div>
                }
                miniMap={
                  <DatasheetMiniMap
                    center={featureCenter}
                    zoom={18}
                    mapRef={miniMapRef}
                  />
                }
                getMainMapSnapshot={getMainMapSnapshot}
                getMiniMapSnapshot={getMiniMapSnapshot}
                onReturnToMap={handleReturnToMap}
              />
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
