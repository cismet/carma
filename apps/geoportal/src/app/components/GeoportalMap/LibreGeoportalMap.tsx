import { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useSearchParams } from "react-router-dom";

import "./LibreGeoportalMap.css";
import { useSelector } from "react-redux";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";
import { defaultLayerConfig } from "../../config";
import {
  Control,
  ControlLayout,
  Main,
} from "@carma-mapping/map-controls-layout";
import { Slider } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";

const LibreGeoportalMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [showOpacitySliders, setShowOpacitySliders] = useState(false);

  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const layersToMapLibreStyle = async () => {
    const style: StyleSpecification = {
      version: 8,
      sources: {
        terrainSource: {
          type: "raster-dem",
          tiles: [
            "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
          ],
          tileSize: 512,
        },
      },
      layers: [],
      glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
      sprite: "https://tiles.cismet.de/poi/sprites",
      terrain: {
        source: "terrainSource",
        exaggeration: 1,
      },
    };

    if (backgroundLayer) {
      const namedLayers = defaultLayerConfig.namedLayers;
      const backgroundLayers = backgroundLayer.layers.split("|");
      if (backgroundLayer.layers.includes("basemap_relief")) {
        style.glyphs = "https://glyphs.cismet.de/fonts/{fontstack}/{range}.pbf";
      }
      for (const layer of backgroundLayers) {
        const layerName = layer.split("@")[0];
        const layerOptions = namedLayers[layerName];
        const opacity = layer.split("@")[1];
        const sourceId = `source-${layerName}`;

        if (layerOptions && layerOptions.type !== "vector") {
          const url =
            layerOptions.type === "tiles"
              ? layerOptions.url
              : `${layerOptions.url}?bbox={bbox-epsg-3857}&styles=&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=${layerOptions.layers}&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
          style.sources[sourceId] = {
            type: "raster",
            tiles: [url],
            tileSize: 256,
          };

          style.layers.push({
            id: `layer-${layerName}`,
            type: "raster",
            source: sourceId,
            paint: {
              "raster-opacity": Number(opacity) / 100,
            },
          });
        } else if (layerOptions && layerOptions.type === "vector") {
          const vectorStyle = layerOptions.style;

          if (vectorStyle) {
            const response = await fetch(vectorStyle);
            const additionalStyle = await response.json();

            style.sources = { ...style.sources, ...additionalStyle.sources };
            style.layers = [...style.layers, ...additionalStyle.layers];
          }
        }
      }
    }

    const layerPromises = layers.map(async (layer, index) => {
      if (!layer.props) return;

      if (layer.layerType === "wmts" || layer.layerType === "wmts-nt") {
        const { url, name } = layer.props;
        if (!url || !name) return;

        const sourceId = `source-${name.replace(/[^a-zA-Z0-9]/g, "-")}`;

        style.sources[sourceId] = {
          type: "raster",
          tiles: [
            `${url}bbox={bbox-epsg-3857}&styles=&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=${name}&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
          ],
          tileSize: 256,
        };

        style.layers.push({
          id: `${layer.id}-${name.replace(/[^a-zA-Z0-9]/g, "-")}`,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": layer.opacity,
          },
        });
      } else if (layer.layerType === "vector") {
        const vectorStyle = layer.props.style;

        if (vectorStyle) {
          const response = await fetch(vectorStyle);
          const additionalStyle = await response.json();
          additionalStyle.layers = additionalStyle.layers.map((styleLayer) => ({
            ...styleLayer,
            id: `${layer.id}-${styleLayer.id}`,
          }));

          style.sources = { ...style.sources, ...additionalStyle.sources };
          style.layers = [...style.layers, ...additionalStyle.layers];
        }
      }
    });

    await Promise.all(layerPromises);

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

  const getAllLayersByPrefix = (prefix: string) => {
    return (
      map.current?.getStyle().layers.filter((styleLayer) => {
        return (
          styleLayer.id.startsWith(prefix) &&
          !styleLayer.id.includes("selection")
        );
      }) || []
    );
  };

  const getPaintProperty = (layerStyle: LayerSpecification) => {
    const type = layerStyle.type;
    switch (type) {
      case "symbol":
        return layerStyle.id.includes("labels")
          ? "text-opacity"
          : "icon-opacity";
      case "raster":
        return "raster-opacity";
      default:
        return "icon-opacity";
    }
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
        pitch: 0,
        maxPitch: 85,
      });

      map.current.on("load", () => {
        map.current?.addControl(
          new maplibregl.NavigationControl({
            visualizePitch: true,
            showZoom: true,
            showCompass: true,
          }),
          "top-left"
        );
        map.current?.addControl(
          new maplibregl.TerrainControl({
            source: "terrainSource",
            exaggeration: 1,
          }),
          "top-left"
        );
        map.current?.setTerrain(null);
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

    const updateMapStyle = async () => {
      try {
        const style = await layersToMapLibreStyle();
        map.current?.setStyle(style);
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [layers, backgroundLayer]);

  return (
    <ControlLayout>
      <Control position="topcenter" order={0}>
        <div className="flex flex-col gap-2 items-center">
          <div className="flex items-center rounded-md px-2 bg-white shadow-lg">
            <button onClick={() => setShowOpacitySliders(!showOpacitySliders)}>
              <FontAwesomeIcon
                icon={showOpacitySliders ? faChevronUp : faChevronDown}
              />
            </button>
          </div>

          {showOpacitySliders &&
            layers.map((layer, index) => {
              return (
                <div
                  key={layer.id}
                  className="flex items-center w-[600px] gap-2 rounded-md px-2 bg-white shadow-lg"
                >
                  <p className="mb-0 w-1/2 truncate">{layer.title}</p>
                  <Slider
                    min={0}
                    max={100}
                    defaultValue={100}
                    className="w-80"
                    onChange={(value) => {
                      const styleLayers = getAllLayersByPrefix(layer.id);
                      styleLayers.forEach((styleLayer) => {
                        map.current?.setPaintProperty(
                          styleLayer.id,
                          getPaintProperty(styleLayer),
                          value / 100
                        );
                      });
                    }}
                  />
                </div>
              );
            })}
        </div>
      </Control>
      <Main>
        <div className="map-wrap">
          <div ref={mapContainer} className="map" />
        </div>
      </Main>
    </ControlLayout>
  );
};

export default LibreGeoportalMap;
