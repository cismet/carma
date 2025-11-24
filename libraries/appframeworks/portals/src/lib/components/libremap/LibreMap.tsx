import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
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

interface LibreMapProps {
  vectorStyles?: VectorStyle[];
  setLibreMap: (map: maplibregl.Map) => void;
}

export const LibreMap = ({ vectorStyles, setLibreMap }: LibreMapProps) => {
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

  const backgroundStyle: StyleSpecification = {
    version: 8,
    sources: {
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
    if (!map.current || !vectorStyles) return;

    const updateMapStyle = async () => {
      try {
        const style = await vectorStylesToMapLibreStyle(vectorStyles);
        map.current?.setStyle(style);
        const mapping = await getVectorMapping(vectorStyles);
        mappingRef.current = mapping;
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [vectorStyles]);

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
