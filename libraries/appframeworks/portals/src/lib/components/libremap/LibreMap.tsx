import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { getHashParams } from "@carma-commons/utils";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import PhotoLightBox from "react-cismap/topicmaps/PhotoLightBox";
import "./map.css";
import {
  createFeature,
  createPieChart,
  getVectorMapping,
  vectorStylesToMapLibreStyle,
  zoom256as512,
  zoom512as256,
} from "./libremap.utils";
import { LibreLayer, VectorStyle } from "../CarmaMap";
import { LibreMapSelectionContent } from "../LibreMapSelectionContent";
import { SelectionItem } from "../SelectionProvider";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
import { useSelectionLibreMap } from "../../hooks/useSelectionLibreMap";
import { defaultLayerConf } from "../react-cismap/tools/layerFactory";
import { useMapHashRouting } from "../../hooks/useMapHashRouting";
import { FeatureInfobox } from "../FeatureInfobox";

interface LibreMapProps {
  backgroundLayers?: string;
  layers?: LibreLayer[];
  setLibreMap: (map: maplibregl.Map) => void;
  onProgressUpdate?: (progress: { current: number; total: number }) => void;
}

export const LibreMap = ({
  backgroundLayers,
  layers,
  setLibreMap,
  onProgressUpdate,
}: LibreMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const selectedFeatures: Set<{
    source: string;
    sourceLayer?: string;
    id?: string | number;
    selectionLayerId?: string;
  }> = new Set();
  const mappingRef = useRef({});
  const isIdleRef = useRef(false);
  const vectorSourcesReadyRef = useRef(false);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const markersOnScreen = useRef<Record<string, maplibregl.Marker>>({});
  const geoJsonMetadataRef = useRef<
    Array<{ sourceId: string; uniqueColors: string[] }>
  >([]);
  const isInitialGeoJsonLoad = useRef(true);

  const { clusteringEnabled } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );

  const defaultLng = 7.150764;
  const defaultLat = 51.256;
  const defaultZoom = 15;

  // Helper function to build WMS tile URL from layer config
  const buildWMSTileUrl = (layerConfig: any): string => {
    const {
      url,
      layers,
      version = "1.1.1",
      format = "image/png",
    } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMS&REQUEST=GetMap&VERSION=${version}&LAYERS=${layers}&FORMAT=${format}&styles=default&TRANSPARENT=true&WIDTH=256&HEIGHT=256&crs=EPSG:3857&&srs=EPSG:3857&BBOX={bbox-epsg-3857}`;
  };

  // Helper function to build WMTS tile URL from layer config
  const buildWMTSTileUrl = (layerConfig: any): string => {
    const { url, layers } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layers}&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
  };

  // Parse backgroundLayers string and build style
  const buildBackgroundStyle = (): StyleSpecification => {
    if (!backgroundLayers) {
      // Default fallback style
      return {
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
    }

    const layerSpecs = backgroundLayers.split("|");
    const sources: Record<string, any> = {
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
        ],
        tileSize: 512,
        maxzoom: 15,
      },
    };
    const layers: any[] = [];

    layerSpecs.forEach((spec, index) => {
      const [layerName, opacityStr] = spec.split("@");
      const opacity = opacityStr ? parseInt(opacityStr, 10) / 100 : 1.0;
      const layerConfig = defaultLayerConf.namedLayers[layerName];

      if (!layerConfig) {
        console.warn(`Layer "${layerName}" not found in defaultLayerConf`);
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
          tiles: [buildWMTSTileUrl(layerConfig)],
          tileSize: 256,
        };
      } else if (layerConfig.type === "wms" || layerConfig.type === "wms-nt") {
        sources[sourceId] = {
          type: "raster",
          tiles: [buildWMSTileUrl(layerConfig)],
          tileSize: 256,
        };
      } else {
        console.warn(
          `Layer type "${layerConfig.type}" not supported for MapLibre`
        );
        return;
      }

      // Add layer
      layers.push({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": opacity },
      });
    });

    // If no valid layers were parsed, return default style
    if (layers.length === 0) {
      return {
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
    }

    return {
      version: 8,
      sources,
      layers,
    };
  };

  const backgroundStyle = useMemo(
    () => buildBackgroundStyle(),
    [backgroundLayers]
  );
  useEffect(() => {
    // Only initialize if we have a container and no map yet
    if (mapContainer.current && !map.current) {
      const hashParams = getHashParams();

      const lng =
        hashParams["lng"] !== undefined
          ? parseFloat(hashParams["lng"])
          : defaultLng;

      const lat =
        hashParams["lat"] !== undefined
          ? parseFloat(hashParams["lat"])
          : defaultLat;

      const zoom =
        hashParams["zoom"] !== undefined
          ? parseFloat(hashParams["zoom"]) - 1
          : defaultZoom;

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: zoom,
        attributionControl: false,
      });
      map.current = mapInstance;
      setLibreMap(mapInstance);

      mapInstance.on("click", (e) => {
        const point = mapInstance.project([e.lngLat.lng, e.lngLat.lat]);
        const hits = mapInstance.queryRenderedFeatures(point);
        let filteredHits = hits.filter((hit) => {
          return (
            !hit.layer.id.includes("selection") &&
            !hit.layer.id.includes("cluster")
          );
        });

        selectedFeatures.forEach((feature) => {
          try {
            // If we have a selection layer ID, reset its filter
            if (
              feature.selectionLayerId &&
              map.current?.getLayer(feature.selectionLayerId)
            ) {
              // Set a filter that won't match any features
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
            console.error("Error clearing building selection:", error);
          }
        });

        selectedFeatures.clear();
        setSelectedFeature({});
        if (filteredHits.length > 0) {
          const selectedVectorFeature = filteredHits[0];

          // Try to get layer ID from metadata (for vector layers)
          const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];

          // Try to get mapping by layer ID first, then by source (for geojson layers)
          let layerMapping =
            mappingRef.current[layerId] ||
            mappingRef.current[selectedVectorFeature.source];

          let feature;
          if (layerMapping) {
            feature = createFeature(selectedVectorFeature, layerMapping);
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
              selectedFeatures.add({
                source: selectedVectorFeature.source,
                sourceLayer: selectedVectorFeature.sourceLayer,
                id: selectedVectorFeature.id,
              });
            }
            setSelectedFeature(feature);
          }
        }
      });

      const checkVectorSourcesReady = () => {
        const style = mapInstance.getStyle();
        if (!style || !style.sources) {
          vectorSourcesReadyRef.current = false;
          return;
        }

        const vectorSources = Object.entries(style.sources).filter(
          ([_, source]: [string, any]) => source.type === "vector"
        );

        if (vectorSources.length === 0) {
          vectorSourcesReadyRef.current = false;
          return;
        }

        const allLoaded = vectorSources.every(([sourceId]) =>
          mapInstance.isSourceLoaded(sourceId)
        );

        vectorSourcesReadyRef.current = allLoaded;
      };

      mapInstance.on("sourcedata", (e) => {
        if (e.isSourceLoaded && e.source.type === "vector") {
          checkVectorSourcesReady();
        }
      });

      mapInstance.on("idle", () => {
        isIdleRef.current = true;
      });

      mapInstance.on("move", () => {
        if (layers.find((layer) => layer.type === "vector")) {
          vectorSourcesReadyRef.current = false;
        } else {
          vectorSourcesReadyRef.current = true;
        }
        isIdleRef.current = false;
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update markers for pie chart clusters
  const updateMarkers = () => {
    if (!map.current || geoJsonMetadataRef.current.length === 0) return;

    geoJsonMetadataRef.current.forEach(({ sourceId, uniqueColors }) => {
      const newMarkers: Record<string, maplibregl.Marker> = {};
      const features = map.current!.querySourceFeatures(sourceId);

      for (const feature of features) {
        if (!feature.geometry || feature.geometry.type === "GeometryCollection")
          continue;
        const coords = feature.geometry.coordinates as [number, number];
        const props = feature.properties;
        if (!props || !props.cluster) continue;
        const id = `${sourceId}-${props.cluster_id}`;

        let marker = markers.current[id];
        if (!marker) {
          const el = createPieChart(props, uniqueColors);
          marker = markers.current[id] = new maplibregl.Marker({
            element: el,
          }).setLngLat(coords);

          // Add click handler to zoom into cluster
          el.addEventListener("click", () => {
            const currentZoom = map.current!.getZoom();
            const pointCount = props.point_count;
            const zoomIncrement =
              pointCount > 100 ? 3 : pointCount > 50 ? 2 : 1;
            const newZoom = Math.min(
              currentZoom + zoomIncrement,
              map.current!.getMaxZoom()
            );
            map.current!.flyTo({
              center: coords,
              zoom: newZoom,
              essential: true,
            });
          });
        }
        newMarkers[id] = marker;

        if (!markersOnScreen.current[id]) marker.addTo(map.current!);
      }

      // Remove markers that are no longer visible
      for (const id in markersOnScreen.current) {
        if (id.startsWith(sourceId) && !newMarkers[id]) {
          markersOnScreen.current[id].remove();
          delete markersOnScreen.current[id];
        }
      }

      // Update markers on screen for this source
      Object.keys(newMarkers).forEach((id) => {
        markersOnScreen.current[id] = newMarkers[id];
      });
    });
  };

  useEffect(() => {
    if (!map.current) return;

    const updateMapStyle = async () => {
      try {
        if (layers) {
          // Show initial progress only on first load or when layers change
          const geoJsonLayers = layers.filter(
            (layer) => layer.type === "geojson"
          );

          // Check if geojson layers have changed by comparing with previous metadata
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

          // Update with vector styles and background layers
          const { style, geoJsonMetadata } = await vectorStylesToMapLibreStyle({
            layers,
            backgroundStyle,
            clusteringEnabled,
          });

          // Store geojson metadata for pie chart rendering
          geoJsonMetadataRef.current = geoJsonMetadata;

          // Save terrain state before setting style
          const currentTerrain = map.current?.getTerrain();

          map.current?.setStyle(style);

          // Restore terrain after style is loaded if it was previously set
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

          // Get mapping for vector layers
          const vectorLayers = layers.filter(
            (layer) => layer.type === "vector"
          );
          let mapping = {};
          if (vectorLayers.length > 0) {
            mapping = await getVectorMapping(vectorLayers);
          }

          // Add mapping for geojson layers
          geoJsonLayers.forEach((layer, index) => {
            if (layer.infoboxMapping && layer.infoboxMapping.length > 0) {
              const sourceId = `geojson-source-${index}`;
              mapping[layer.name] = layer.infoboxMapping;
              // Also map by source ID for easier lookup
              mapping[sourceId] = layer.infoboxMapping;
            }
          });

          mappingRef.current = mapping;

          // Set up marker updates after style is set (only if clustering is enabled)
          if (geoJsonMetadata.length > 0 && clusteringEnabled) {
            const loadedSources = new Set<string>();

            // Wait for style to load, then set up listeners
            const handleStyleLoad = () => {
              const handleData = (e: any) => {
                const isRelevantSource = geoJsonMetadata.some(
                  ({ sourceId }) => e.sourceId === sourceId
                );
                if (!isRelevantSource || !e.isSourceLoaded) return;

                // Track loaded sources for progress
                if (!loadedSources.has(e.sourceId)) {
                  loadedSources.add(e.sourceId);
                  if (onProgressUpdate && isInitialGeoJsonLoad.current) {
                    onProgressUpdate({
                      current: loadedSources.size,
                      total: geoJsonMetadata.length,
                    });

                    // Mark as loaded after all sources are complete
                    if (loadedSources.size === geoJsonMetadata.length) {
                      isInitialGeoJsonLoad.current = false;
                    }
                  }
                }

                updateMarkers();
              };

              map.current!.on("data", handleData);
              map.current!.on("move", updateMarkers);
              map.current!.on("moveend", () => {
                setTimeout(updateMarkers, 100);
              });
            };

            if (map.current!.isStyleLoaded()) {
              handleStyleLoad();
            } else {
              map.current!.once("styledata", handleStyleLoad);
            }
          } else if (onProgressUpdate) {
            // No geojson layers, complete immediately
            onProgressUpdate({ current: 1, total: 1 });
          }
        } else {
          // Only update background layers
          map.current?.setStyle(backgroundStyle);
          geoJsonMetadataRef.current = [];
        }
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [backgroundStyle, layers, clusteringEnabled]);

  const { handleTopicMapLocationChange } = useMapHashRouting({
    getLeafletMap: () => {
      const m = map.current;
      if (!m) return null;
      return {
        setView: (center: { lat: number; lng: number }, zoom?: number) => {
          if (typeof zoom === "number") m.setZoom(zoom256as512(zoom));
          m.setCenter([center.lng, center.lat]);
        },
        panTo: (center: { lat: number; lng: number }) =>
          m.panTo([center.lng, center.lat]),
        setZoom: (zoom: number) => m.setZoom(zoom256as512(zoom)),
        getCenter: () => m.getCenter(),
        once: (type: string, fn: (...args: unknown[]) => void) =>
          m.once(type, fn),
      };
    },
    getLeafletZoom: () => {
      const m = map.current;
      return m ? zoom512as256(m.getZoom()) : 12;
    },
    labels: {
      clearCesium: "LGM:2D:clearCesium",
      writeLeafletLike: "LGM:2D:writeLocation",
      topicMapLocation: "LGM:2D:location",
    },
  });

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    const handleMoveEnd = () => {
      const center = mapInstance.getCenter();
      const zoom = zoom512as256(mapInstance.getZoom());
      handleTopicMapLocationChange({ lat: center.lat, lng: center.lng, zoom });
    };
    mapInstance.on("moveend", handleMoveEnd);
    return () => {
      mapInstance && mapInstance.off("moveend", handleMoveEnd);
    };
  }, [handleTopicMapLocationChange]);

  const onComplete = (selection: SelectionItem) => {
    if (!isAreaType(selection.type as ENDPOINT)) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);

      if (vectorSourcesReadyRef.current) {
        setTimeout(() => {
          if (map.current) {
            map.current.fire("click", {
              lngLat: {
                lat: selectedPos[1],
                lng: selectedPos[0],
              },
              target: map.current,
              type: "click",
              point: map.current.project([selectedPos[1], selectedPos[0]]),
              originalEvent: {
                preventDefault: () => {},
                stopPropagation: () => {},
              },
            });
          }
        }, 500);
      } else {
        setTimeout(() => {
          onComplete(selection);
        }, 20);
      }
    }
  };

  useSelectionLibreMap({
    map: map.current,
    onComplete,
  });

  return (
    <>
      <FeatureInfobox
        selectedFeature={
          selectedFeature
            ? {
                ...selectedFeature,
                properties: {
                  info: {
                    ...selectedFeature.properties,
                  },
                },
              }
            : null
        }
        libreMap={map.current}
        versionData={{
          version: "0.1.0",
        }}
      />
      <PhotoLightBox />
      <LibreMapSelectionContent map={map.current} />

      <div className="map-wrap">
        <div ref={mapContainer} className="map" />
      </div>
    </>
  );
};

export default LibreMap;
