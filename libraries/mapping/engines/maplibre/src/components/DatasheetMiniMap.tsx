import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useLibreContext } from "../contexts/LibreContext";
import { useClusterMarkers } from "../hooks/useClusterMarkers";
import { WUPPERTAL_PREVIEW_STYLE } from "../constants/wuppertalDefaultStyle";

export interface DatasheetMiniMapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  style?: React.CSSProperties;
  mapRef?: React.MutableRefObject<maplibregl.Map | null>;
}

const defaultContainerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

export const DatasheetMiniMap = ({
  center,
  zoom = 18,
  className,
  style = defaultContainerStyle,
  mapRef,
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
        style: mapStyle ?? WUPPERTAL_PREVIEW_STYLE,
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

  // React to center/zoom prop changes
  useEffect(() => {
    if (map.current && center) {
      map.current.jumpTo({ center, zoom });
    }
  }, [center?.[0], center?.[1], zoom]);

  return <div ref={mapContainer} className={className} style={style} />;
};
