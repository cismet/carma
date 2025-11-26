import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { getHashParams } from "@carma-commons/utils";

import "./map.css";
import {
  createFeature,
  getVectorMapping,
  vectorStylesToMapLibreStyle,
} from "./libremap.utils";
import { VectorStyle } from "../CarmaMap";
import LibreFeatureInfoBox from "./LibreFeatureInfoBox";
import { LibreMapSelectionContent } from "../LibreMapSelectionContent";
import { SelectionItem } from "../SelectionProvider";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
import { useSelectionLibreMap } from "../../hooks/useSelectionLibreMap";
import { defaultLayerConf } from "../react-cismap/tools/layerFactory";

interface LibreMapProps {
  vectorStyles?: VectorStyle[];
  backgroundLayers?: string;
  setLibreMap: (map: maplibregl.Map) => void;
}

export const LibreMap = ({
  vectorStyles,
  backgroundLayers,
  setLibreMap,
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
  const [selectedFeature, setSelectedFeature] = useState({});

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

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: defaultZoom,
        attributionControl: false,
      });
      map.current = mapInstance;
      setLibreMap(mapInstance);

      mapInstance.on("click", (e) => {
        const point = mapInstance.project([e.lngLat.lng, e.lngLat.lat]);
        const hits = mapInstance.queryRenderedFeatures(point);
        let filteredHits = hits.filter((hit) => {
          return !hit.layer.id.includes("selection");
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

          const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];

          const layerMapping = mappingRef.current[layerId];

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
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    const updateMapStyle = async () => {
      try {
        if (vectorStyles) {
          // Update with vector styles and background layers
          const style = await vectorStylesToMapLibreStyle(
            vectorStyles,
            backgroundStyle
          );
          map.current?.setStyle(style);
          const mapping = await getVectorMapping(vectorStyles);
          mappingRef.current = mapping;
        } else {
          // Only update background layers
          map.current?.setStyle(backgroundStyle);
        }
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [vectorStyles, backgroundStyle]);

  const onComplete = (selection: SelectionItem) => {
    if (!isAreaType(selection.type as ENDPOINT)) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);

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
    }
  };

  useSelectionLibreMap({
    map: map.current,
    onComplete,
  });

  return (
    <>
      <LibreFeatureInfoBox
        selectedFeature={selectedFeature}
        libreMap={map.current}
      />
      <LibreMapSelectionContent map={map.current} />

      <div className="map-wrap">
        <div ref={mapContainer} className="map" />
      </div>
    </>
  );
};

export default LibreMap;
