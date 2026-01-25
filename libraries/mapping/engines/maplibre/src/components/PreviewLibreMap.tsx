import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useLibreContext } from "../contexts/LibreContext";
import { useClusterMarkers } from "../hooks/useClusterMarkers";
import { WUPPERTAL_PREVIEW_STYLE } from "../constants/wuppertalDefaultStyle";

interface PreviewLibreMapProps {
  lat?: number;
  lng?: number;
  zoom?: number;
  style?: React.CSSProperties;
}

const defaultContainerStyle: React.CSSProperties = {
  width: "100%",
  height: 300,
};

export const PreviewLibreMap = ({
  lat = 51.2725699,
  lng = 7.199918,
  zoom = 15,
  style = defaultContainerStyle,
}: PreviewLibreMapProps) => {
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
        center: [lng, lat],
        zoom: zoom,
        attributionControl: false,
        interactive: false,
      });

      map.current = instance;
      setMapInstance(instance);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInstance(null);
      }
    };
  }, []);

  useEffect(() => {
    if (map.current && mapStyle) {
      map.current.setStyle(mapStyle);
    }
  }, [mapStyle]);

  return <div ref={mapContainer} style={style} />;
};
