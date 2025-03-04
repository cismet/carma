import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useSearchParams } from "react-router-dom";

import "./LibreGeoportalMap.css";
import { useSelector } from "react-redux";
import { getLayers } from "../../store/slices/mapping";

const LibreGeoportalMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const layers = useSelector(getLayers);

  const layersToMapLibreStyle = () => {
    const style: StyleSpecification = {
      version: 8,
      sources: {},
      layers: [],
    };

    layers.forEach((layer, index) => {
      if (!layer.props) return;

      const { url, name } = layer.props;
      if (!url || !name) return;

      const sourceId = `source-${name.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`;

      style.sources[sourceId] = {
        type: "raster",
        tiles: [
          `${url}bbox={bbox-epsg-3857}&styles=&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=${name}&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
        ],
        tileSize: 256,
      };

      style.layers.push({
        id: `layer-${name.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": layer.opacity,
        },
      });
    });

    return style;
  };

  const defaultLng = 7.150764;
  const defaultLat = 51.256;
  const defaultZoom = 10;

  const [lng, setLng] = useState(() => {
    const lngParam = searchParams.get("lng");
    return lngParam ? parseFloat(lngParam) : defaultLng;
  });

  const [lat, setLat] = useState(() => {
    const latParam = searchParams.get("lat");
    return latParam ? parseFloat(latParam) : defaultLat;
  });

  const [zoom, setZoom] = useState(() => {
    const zoomParam = searchParams.get("zoom");
    return zoomParam ? parseFloat(zoomParam) : defaultZoom;
  });

  const backgroundStyle: StyleSpecification = {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "osm-layer",
        type: "raster",
        source: "osm",
        paint: { "raster-opacity": 1 },
      },
    ],
  };

  useEffect(() => {
    if (map.current) return; // initialize map only once

    if (mapContainer.current) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: zoom,
        maxZoom: 22,
      });

      map.current.on("load", () => {
        map.current?.addControl(new maplibregl.NavigationControl(), "top-left");
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    map.current.setCenter([lng, lat]);
    map.current.setZoom(zoom);
  }, [lng, lat, zoom]);

  useEffect(() => {
    if (!map.current) return;

    const style = layersToMapLibreStyle();
    map.current.setStyle(style);
  }, [layers]);

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
    </div>
  );
};

export default LibreGeoportalMap;
