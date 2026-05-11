import { useEffect, useRef, useState } from "react";

import maplibregl from "maplibre-gl";

import { CARMA_PREVIEW_STYLE } from "../constants/defaultStyle";
import { DATASHEET_MINI_MAP_ZOOM_DEFAULTS } from "../constants/datasheet-mini-map-defaults";
import { useLibreContext } from "../contexts/LibreContext";
import { useClusterMarkers } from "../hooks/useClusterMarkers";
import { buildFeatureStateTarget } from "../utils/featureStateTarget";

import "maplibre-gl/dist/maplibre-gl.css";
export interface SelectedFeatureIdentifier {
  source: string;
  sourceLayer?: string;
  id?: string | number;
}

export interface DatasheetMiniMapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  style?: React.CSSProperties;
  mapRef?: React.MutableRefObject<maplibregl.Map | null>;
  selectedFeatureId?: SelectedFeatureIdentifier | null;
}

const defaultContainerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

export const DatasheetMiniMap = ({
  center,
  zoom = DATASHEET_MINI_MAP_ZOOM_DEFAULTS.defaultZoom,
  className,
  style = defaultContainerStyle,
  mapRef,
  selectedFeatureId,
}: DatasheetMiniMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const { mapStyle, geoJsonMetadata } = useLibreContext();

  useClusterMarkers({
    map: mapInstance,
    geoJsonMetadata,
    interactive: false,
  });

  useEffect(() => {
    if (mapContainer.current && !map.current) {
      const instance = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyle ?? CARMA_PREVIEW_STYLE,
        center: center ?? [7.150764, 51.256],
        zoom,
        attributionControl: false,
        interactive: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });

      map.current = instance;
      setMapInstance(instance);
      if (mapRef) {
        mapRef.current = instance;
      }
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInstance(null);
        if (mapRef) {
          mapRef.current = null;
        }
      }
    };
  }, []);

  // Keep style in sync with the main map
  useEffect(() => {
    if (map.current && mapStyle) {
      map.current.setStyle(mapStyle);
    }
  }, [mapStyle]);

  // React to center/zoom prop changes; also resize in case the container
  // was display:none when the map was created (mini-map starts hidden).
  useEffect(() => {
    if (map.current && center) {
      map.current.resize();
      map.current.jumpTo({ center, zoom });
    }
  }, [center?.[0], center?.[1], zoom]);

  // Sync feature-state selection highlight with the main map
  const prevSelectionRef = useRef<SelectedFeatureIdentifier | null>(null);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const apply = () => {
      // Clear previous selection
      if (prevSelectionRef.current) {
        try {
          m.setFeatureState(
            buildFeatureStateTarget(m, prevSelectionRef.current),
            { selected: false }
          );
        } catch {
          // Source may not exist yet
        }
      }

      // Apply new selection
      if (selectedFeatureId) {
        try {
          m.setFeatureState(
            buildFeatureStateTarget(m, selectedFeatureId),
            { selected: true }
          );
        } catch {
          // Source may not exist yet
        }
      }

      prevSelectionRef.current = selectedFeatureId ?? null;
    };

    // If the style is already loaded, apply immediately; otherwise wait
    if (m.isStyleLoaded()) {
      apply();
    } else {
      m.once("styledata", apply);
    }
  }, [
    selectedFeatureId?.source,
    selectedFeatureId?.sourceLayer,
    selectedFeatureId?.id,
  ]);

  return <div ref={mapContainer} className={className} style={style} />;
};
