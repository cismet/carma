import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";
import "./mapLibre.css";
import { Button } from "react-bootstrap";
import { Map } from "maplibre-gl";

export default function LibreMap({
  opacity = 0.5,
  textOpacity = 1,
  iconOpacity = 1,
}: { opacity?: number; textOpacity?: number; iconOpacity?: number } = {}) {
  const mapContainer = useRef(null);
  const map = useRef<Map | null>(null);
  const [lng] = useState(7.150764);
  const [lat] = useState(51.256);
  const [zoom] = useState(15);

  useEffect(() => {
    if (map.current !== null || mapContainer.current === null) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://omt.map-hosting.de/styles/osm-bright/style.json`,
      center: [lng, lat],
      zoom: zoom,
      maxZoom: 19,
    });
    console.log("map.current", map.current);

    if (opacity || textOpacity || iconOpacity) {
      map.current.getStyle().layers.map((layer) => {
        if (map.current) {
          if (layer.type === "symbol") {
            map.current.setPaintProperty(
              layer.id,
              `icon-opacity`,
              iconOpacity || opacity || 1,
            );
            map.current.setPaintProperty(
              layer.id,
              `text-opacity`,
              textOpacity || opacity || 1,
            );
          } else {
            map.current.setPaintProperty(
              layer.id,
              `${layer.type}-opacity`,
              opacity || 1,
            );
          }
        }
      });
    }

    map.current.on("load", function () {
      console.log('on"load"');

      if (map.current) {
        map.current.addSource(
          "wms-test-source",

          {
            type: "raster",
            // use the tiles option to specify a WMS tile source URL
            // https://maplibre.org/maplibre-gl-js-docs/style-spec/sources/
            tiles: [
              "https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102:trueortho2022&styles=&format=image%2Fpng&transparent=false&version=1.1.1&tiled=true&type=wms&cssFilter=undefined&width=256&height=256&srs=EPSG%3A3857&bbox={bbox-epsg-3857}",
            ],
            tileSize: 256,
          },
        );

        map.current.addSource("terrainSource", {
          type: "raster-dem",
          tiles: [
            "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
          ],
          tileSize: 512,
          maxzoom: 15,
        });
        map.current.addSource("hillshadeSource", {
          type: "raster-dem",
          tiles: [
            "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
          ],
          tileSize: 512,
          maxzoom: 15,
        });

        // Layers ------------------------------------------------------------------------------
        map.current.addLayer({
          id: "wms-test-layer",
          type: "raster",
          //opacity: 0.25,
          source: "wms-test-source",
          paint: { "raster-opacity": 0.5 },
        });

        map.current.addLayer({
          id: "hillshade",
          type: "hillshade",
          source: "hillshadeSource",
          layout: { visibility: "visible" },
          paint: {
            "hillshade-accent-color": "#5a5a5a",
            "hillshade-exaggeration": 0.5,
            "hillshade-highlight-color": "#FFFFFF",
            "hillshade-illumination-anchor": "viewport",
            "hillshade-illumination-direction": 335,
            "hillshade-shadow-color": "#5a5a5a",
          },
        });

        // map.current.addLayer({
        //   id: '3d-buildings',
        //   source: 'openmaptiles',
        //   'source-layer': 'building',

        //   type: 'fill-extrusion',
        //   minzoom: 15,
        //   paint: {
        //     'fill-extrusion-color': '#aaa',
        //     'fill-extrusion-height': {
        //       type: 'identity',
        //       property: 'render_height',
        //     },
        //     'fill-extrusion-base': {
        //       type: 'identity',
        //       property: 'render_min_height',
        //     },
        //     'fill-extrusion-opacity': 0.5,
        //   },
        // });
      }
      console.log("map.current", map.current);
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-left");
    map.current.addControl(
      new maplibregl.TerrainControl({
        source: "terrainSource",
        exaggeration: 1,
      }),
      "top-left",
    );
  });

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
      <Button>askdjh</Button>
    </div>
  );
}
