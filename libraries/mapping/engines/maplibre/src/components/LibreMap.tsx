import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, ReactNode } from "react";
import { getHashParams } from "@carma-commons/utils";

// Import from our migrated utils
import {
  getVectorMapping,
  styleManipulation,
  vectorStylesToMapLibreStyle,
} from "../utils/styleBuilder";
import { createFeature } from "../utils/featureUtils";
import { zoom512as256 } from "../utils/zoomUtils";
import "../styles/map.css";

// Import from our migrated context and hooks
import { useLibreContext } from "../contexts/LibreContext";
import { useClusterMarkers } from "../hooks/useClusterMarkers";

// Types
export interface VectorStyle {
  name: string;
  style: string;
  layer?: string;
  infoboxMapping?: string[];
}

export type LibreLayer =
  | ({ type: "vector" } & VectorStyle)
  | { type: "geojson"; name: string; data: string; infoboxMapping?: string[] };

export interface GeoJsonData {
  sourceId: string;
  data: GeoJSON.FeatureCollection;
}

export interface SelectedFeatureInfo {
  properties: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
  id?: string | number;
  showMarker?: boolean;
}

// Default layer configuration for background layers
const defaultNamedLayers: Record<string, { type: string; url: string; layers?: string }> = {
  "wupp-plan-live-tiles-3857": {
    type: "tiles",
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  },
  "rvrGrau-tiles-3857": {
    type: "tiles",
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_graublau&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  },
  trueOrtho2022: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2022",
  },
  trueOrtho2024: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2024",
  },
  hillshade: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "hillshade",
  },
};

export interface LibreMapProps {
  /** Background layer string (e.g., "wupp-plan-live-tiles-3857@100") */
  backgroundLayers?: string;
  /** Vector/GeoJSON layers to display */
  layers?: LibreLayer[];
  /** Callback when map instance is created */
  setLibreMap?: (map: maplibregl.Map) => void;
  /** Progress callback for loading layers */
  onProgressUpdate?: (progress: { current: number; total: number }) => void;
  /** Filter function to apply to the map */
  filterFunction?: (
    map: maplibregl.Map,
    layers?: LibreLayer[],
    geoJsonData?: GeoJsonData[]
  ) => void;
  /** Enable routing features */
  useRouting?: boolean;
  /** Callback when a feature is selected */
  onFeatureSelect?: (
    feature: SelectedFeatureInfo | null,
    selectionInfo?: { source: string; sourceLayer?: string; id?: string | number }
  ) => void;
  /** Callback for map move events (for hash routing) */
  onMapMove?: (coords: { lat: number; lng: number; zoom: number }) => void;
  /** Custom named layers configuration */
  namedLayers?: Record<string, { type: string; url: string; layers?: string }>;
  /** Whether clustering is enabled (from context or prop) */
  clusteringEnabled?: boolean;
  /** Marker symbol size for scaling */
  markerSymbolSize?: number;
  /** Initial center coordinates */
  initialCenter?: { lng: number; lat: number };
  /** Initial zoom level */
  initialZoom?: number;
  /** Children to render (e.g., selection content, infobox) */
  children?: ReactNode;
}

export const LibreMap = ({
  backgroundLayers,
  layers,
  setLibreMap,
  onProgressUpdate,
  filterFunction,
  useRouting = false,
  onFeatureSelect,
  onMapMove,
  namedLayers = defaultNamedLayers,
  clusteringEnabled = true,
  markerSymbolSize = 35,
  initialCenter = { lng: 7.150764, lat: 51.256 },
  initialZoom = 15,
  children,
}: LibreMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const selectedFeaturesRef = useRef<Set<{
    source: string;
    sourceLayer?: string;
    id?: string | number;
    selectionLayerId?: string;
  }>>(new Set());
  const mappingRef = useRef<Record<string, string[]>>({});
  // Track selected feature locally for internal state management
  const selectedFeatureRef = useRef<SelectedFeatureInfo | null>(null);
  const geoJsonMetadataRef = useRef<
    Array<{ sourceId: string; uniqueColors: string[] }>
  >([]);
  const isInitialGeoJsonLoad = useRef(true);

  const {
    setMapStyle,
    geoJsonMetadata,
    setGeoJsonMetadata,
    setMap: setContextMap,
  } = useLibreContext();

  useClusterMarkers({
    map: map.current,
    geoJsonMetadata: clusteringEnabled ? geoJsonMetadata : [],
  });

  // Helper function to build WMS tile URL from layer config
  const buildWMSTileUrl = (layerConfig: {
    url: string;
    layers: string;
    version?: string;
    format?: string;
  }): string => {
    const {
      url,
      layers: layerNames,
      version = "1.1.1",
      format = "image/png",
    } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMS&REQUEST=GetMap&VERSION=${version}&LAYERS=${layerNames}&FORMAT=${format}&styles=default&TRANSPARENT=true&WIDTH=256&HEIGHT=256&crs=EPSG:3857&&srs=EPSG:3857&BBOX={bbox-epsg-3857}`;
  };

  // Helper function to build WMTS tile URL from layer config
  const buildWMTSTileUrl = (layerConfig: {
    url: string;
    layers: string;
  }): string => {
    const { url, layers: layerNames } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layerNames}&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
  };

  // Parse backgroundLayers string and build style
  const buildBackgroundStyle = (): StyleSpecification => {
    const defaultStyle: StyleSpecification = {
      version: 8,
      sources: {
        terrainSource: {
          type: "raster-dem",
          tiles: [
            "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
          ],
          tileSize: 512,
          maxzoom: 15,
        },
        "source-amtlich": {
          type: "raster",
          tiles: [
            "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: "layer-amtlich",
          type: "raster",
          source: "source-amtlich",
          paint: { "raster-opacity": 0.9 },
        },
      ],
    };

    if (!backgroundLayers) {
      return defaultStyle;
    }

    const layerSpecs = backgroundLayers.split("|");
    const sources: Record<string, unknown> = {
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
        ],
        tileSize: 512,
        maxzoom: 15,
      },
    };
    const styleLayers: StyleSpecification["layers"] = [];

    layerSpecs.forEach((spec, index) => {
      const [layerName, opacityStr] = spec.split("@");
      const opacity = opacityStr ? parseInt(opacityStr, 10) / 100 : 1.0;
      const layerConfig = namedLayers[layerName];

      if (!layerConfig) {
        console.warn(`Layer "${layerName}" not found in namedLayers`);
        return;
      }

      const sourceId = `source-${layerName}-${index}`;
      const layerId = `layer-${layerName}-${index}`;

      // Build source based on layer type
      if (layerConfig.type === "tiles") {
        sources[sourceId] = {
          type: "raster",
          tiles: [layerConfig.url],
          tileSize: 256,
        };
      } else if (
        layerConfig.type === "wmts" ||
        layerConfig.type === "wmts-nt"
      ) {
        sources[sourceId] = {
          type: "raster",
          tiles: [buildWMTSTileUrl(layerConfig as { url: string; layers: string })],
          tileSize: 256,
        };
      } else if (layerConfig.type === "wms" || layerConfig.type === "wms-nt") {
        sources[sourceId] = {
          type: "raster",
          tiles: [buildWMSTileUrl(layerConfig as { url: string; layers: string })],
          tileSize: 256,
        };
      } else {
        console.warn(
          `Layer type "${layerConfig.type}" not supported for MapLibre`
        );
        return;
      }

      styleLayers.push({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": opacity },
      });
    });

    if (styleLayers.length === 0) {
      return defaultStyle;
    }

    return {
      version: 8,
      sources,
      layers: styleLayers,
    } as StyleSpecification;
  };

  const backgroundStyle = useMemo(
    () => buildBackgroundStyle(),
    [backgroundLayers, namedLayers]
  );

  // Initialize map
  useEffect(() => {
    if (mapContainer.current && !map.current) {
      const hashParams = getHashParams();

      const lng =
        hashParams["lng"] !== undefined
          ? parseFloat(hashParams["lng"])
          : initialCenter.lng;

      const lat =
        hashParams["lat"] !== undefined
          ? parseFloat(hashParams["lat"])
          : initialCenter.lat;

      const zoom =
        hashParams["zoom"] !== undefined
          ? parseFloat(hashParams["zoom"]) - 1
          : initialZoom;

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: zoom,
        attributionControl: false,
      });
      map.current = mapInstance;
      setLibreMap?.(mapInstance);
      setContextMap(mapInstance);

      // Handle click events for feature selection
      mapInstance.on("click", (e) => {
        const point = mapInstance.project([e.lngLat.lng, e.lngLat.lat]);
        const hits = mapInstance.queryRenderedFeatures(point);
        const filteredHits = hits.filter((hit) => {
          return (
            !hit.layer.id.includes("selection") &&
            !hit.layer.id.includes("cluster")
          );
        });

        // Clear previous selections
        selectedFeaturesRef.current.forEach((feature) => {
          try {
            if (
              feature.selectionLayerId &&
              map.current?.getLayer(feature.selectionLayerId)
            ) {
              map.current.setFilter(feature.selectionLayerId, [
                "==",
                "__selected__",
                "true",
              ]);
            } else {
              map.current?.setFeatureState(
                {
                  source: feature.source,
                  sourceLayer: feature.sourceLayer,
                  id: feature.id,
                },
                { selected: false }
              );
            }
          } catch (error) {
            console.error("Error clearing selection:", error);
          }
        });

        selectedFeaturesRef.current.clear();
        selectedFeatureRef.current = null;

        if (filteredHits.length > 0) {
          const selectedVectorFeature = filteredHits[0];
          const layerId = (selectedVectorFeature.layer as { metadata?: { "layer-id"?: string } })?.metadata?.["layer-id"];
          const layerMapping =
            mappingRef.current[layerId as string] ||
            mappingRef.current[selectedVectorFeature.source];

          let feature: SelectedFeatureInfo | null = null;
          if (layerMapping) {
            feature = createFeature(
              selectedVectorFeature,
              layerMapping,
              mapInstance,
              useRouting
            ) as SelectedFeatureInfo | null;
          }

          if (feature) {
            if (layerMapping) {
              mapInstance.setFeatureState(
                {
                  source: selectedVectorFeature.source,
                  sourceLayer: selectedVectorFeature.sourceLayer,
                  id: selectedVectorFeature.id,
                },
                { selected: true }
              );
              selectedFeaturesRef.current.add({
                source: selectedVectorFeature.source,
                sourceLayer: selectedVectorFeature.sourceLayer,
                id: selectedVectorFeature.id,
              });
            }
            selectedFeatureRef.current = feature;
            onFeatureSelect?.(feature, {
              source: selectedVectorFeature.source,
              sourceLayer: selectedVectorFeature.sourceLayer,
              id: selectedVectorFeature.id,
            });
          }
        } else {
          onFeatureSelect?.(null);
        }
      });

      // Handle move events for hash routing
      if (onMapMove) {
        mapInstance.on("moveend", () => {
          const center = mapInstance.getCenter();
          const zoom = zoom512as256(mapInstance.getZoom());
          onMapMove({ lat: center.lat, lng: center.lng, zoom });
        });
      }
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setContextMap(null);
      }
    };
  }, []);

  // Update map style when layers change
  useEffect(() => {
    if (!map.current) return;

    const updateMapStyle = async () => {
      try {
        if (layers) {
          const geoJsonLayers = layers.filter(
            (layer) => layer.type === "geojson"
          );

          const hasGeoJsonLayersChanged =
            geoJsonLayers.length !== geoJsonMetadataRef.current.length;

          if (hasGeoJsonLayersChanged) {
            isInitialGeoJsonLoad.current = true;
          }

          if (
            geoJsonLayers.length > 0 &&
            onProgressUpdate &&
            isInitialGeoJsonLoad.current
          ) {
            onProgressUpdate({ current: 0, total: geoJsonLayers.length });
          }

          const { style: baseStyle, geoJsonMetadata: newGeoJsonMetadata } =
            await vectorStylesToMapLibreStyle({
              layers,
              backgroundStyle,
              clusteringEnabled,
            });

          const style = styleManipulation(markerSymbolSize, baseStyle);

          geoJsonMetadataRef.current = newGeoJsonMetadata;
          setGeoJsonMetadata(newGeoJsonMetadata);

          const currentTerrain = map.current?.getTerrain();

          map.current?.setStyle(style);
          setMapStyle(style);

          if (currentTerrain && map.current) {
            const restoreTerrain = () => {
              if (map.current?.getSource("terrainSource")) {
                map.current.setTerrain(currentTerrain);
              }
            };

            if (map.current.isStyleLoaded()) {
              restoreTerrain();
            } else {
              map.current.once("styledata", restoreTerrain);
            }
          }

          const vectorLayers = layers.filter(
            (layer) => layer.type === "vector"
          ) as VectorStyle[];
          let mapping: Record<string, string[]> = {};
          if (vectorLayers.length > 0) {
            mapping = await getVectorMapping(vectorLayers) as Record<string, string[]>;
          }

          geoJsonLayers.forEach((layer, index) => {
            if (layer.infoboxMapping && layer.infoboxMapping.length > 0) {
              const sourceId = `geojson-source-${index}`;
              mapping[layer.name] = layer.infoboxMapping;
              mapping[sourceId] = layer.infoboxMapping;
            }
          });

          mappingRef.current = mapping;

          if (filterFunction && map.current) {
            const applyFilter = () => {
              if (map.current) {
                filterFunction(map.current, layers);
              }
            };

            if (map.current.isStyleLoaded()) {
              applyFilter();
            } else {
              map.current.once("styledata", applyFilter);
            }
          }

          if (newGeoJsonMetadata.length > 0 && onProgressUpdate) {
            const loadedSources = new Set<string>();

            const handleStyleLoad = () => {
              const handleData = (e: maplibregl.MapDataEvent & { sourceId?: string; isSourceLoaded?: boolean }) => {
                const isRelevantSource = newGeoJsonMetadata.some(
                  ({ sourceId }) => e.sourceId === sourceId
                );
                if (!isRelevantSource || !e.isSourceLoaded) return;

                if (!loadedSources.has(e.sourceId!)) {
                  loadedSources.add(e.sourceId!);
                  if (isInitialGeoJsonLoad.current) {
                    onProgressUpdate({
                      current: loadedSources.size,
                      total: newGeoJsonMetadata.length,
                    });

                    if (loadedSources.size === newGeoJsonMetadata.length) {
                      isInitialGeoJsonLoad.current = false;
                    }
                  }
                }
              };

              map.current!.on("data", handleData);
            };

            if (map.current!.isStyleLoaded()) {
              handleStyleLoad();
            } else {
              map.current!.once("styledata", handleStyleLoad);
            }
          } else if (onProgressUpdate) {
            onProgressUpdate({ current: 1, total: 1 });
          }
        } else {
          map.current?.setStyle(backgroundStyle);
          setMapStyle(backgroundStyle);
          geoJsonMetadataRef.current = [];
        }
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [
    backgroundStyle,
    layers,
    clusteringEnabled,
    markerSymbolSize,
    filterFunction,
  ]);

  return (
    <>
      {children}
      <div className="map-wrap">
        <div ref={mapContainer} className="map" />
      </div>
    </>
  );
};

export default LibreMap;
