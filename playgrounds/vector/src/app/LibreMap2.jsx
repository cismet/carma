import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";
import "./mapLibre.css";
import { Button } from "react-bootstrap";
import { Map } from "maplibre-gl";

export default function LibreMap({ opacity = 0.1, vectorStyles = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  // Zoom overlay state
  const [currentZoom, setCurrentZoom] = useState(null);

  // Attach zoom event and set zoom state when map is ready
  useEffect(() => {
    if (!map.current) return;
    // Set initial zoom
    setCurrentZoom(map.current.getZoom().toFixed(2));
    // Handler
    const handleZoom = () => {
      setCurrentZoom(map.current.getZoom().toFixed(2));
    };
    map.current.on("zoom", handleZoom);
    // Clean up
    return () => {
      if (map.current) {
        map.current.off("zoom", handleZoom);
      }
    };
  }, [map.current]);

  const [lng] = useState(7.2517043);
  const [lat] = useState(51.2542735);
  const [zoom] = useState(19);

  // __style: {
  //   version: 8,
  //   sources: {},
  //   layers: [],
  // },
  // _style: `https://omt.map-hosting.de/styles/osm-bright/style.json`,

  // const backgroundStyle = {
  //   version: 8,
  //   sources: {
  //     rvr_wms: {
  //       type: "raster",
  //       tiles: [
  //         "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  //       ],
  //       tileSize: 256,
  //     },
  //   },
  //   layers: [
  //     {
  //       id: "wms-test-layer",
  //       type: "raster",
  //       opacity: 0.25,

  //       source: "rvr_wms",
  //       paint: { "raster-opacity": 0.7 },
  //     },
  //   ],
  // };

  const backgroundStyle = {
    version: 8,
    sources: {
      alkis_data: {
        type: "vector",
        tiles: ["https://tiles.cismet.de/alkis_laak_3857_17/{z}/{x}/{y}.pbf"],
        // tiles: ["https://tiles.cismet.de/alkis/{z}/{x}/{y}.pbf"],
        minzoom: 9,
        maxzoom: 17,
      },
    },
    glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
    sprite: "https://tiles.cismet.de/alkis/sprites",
    layers: [
      {
        id: "landparcel_fill",
        type: "fill",
        source: "alkis_data",
        "source-layer": "landparcel",
        paint: {
          "fill-color": "#FAFF13",
          "fill-opacity": 0.000001,
        },
      },
      {
        id: "gebaeude_outlines",
        type: "line",
        source: "alkis_data",
        "source-layer": "building",
        paint: {
          "line-color": "#FAFF13",
          "line-width": {
            stops: [
              [13, 0.05],
              [21, 2],
            ],
          },
        },
      },
      {
        id: "gebaeudstruktur_outlines",
        type: "line",
        source: "alkis_data",
        "source-layer": "buildingstructure",
        paint: {
          "line-color": "#FAFF13",
          "line-width": {
            stops: [
              [13, 0.05],
              [21, 2],
            ],
          },
        },
      },
      {
        id: "gebaeude_hatched_cross",
        type: "fill",
        source: "alkis_data",
        "source-layer": "building",
        minzoom: 13,
        filter: ["in", "geb_fkt_code", 3012, 3021, 3040, 3041, 3042],
        paint: {
          "fill-pattern": [
            "step",
            ["zoom"],
            "hatch_cross_faff13_s1",
            16,
            "hatch_cross_faff13_s2",
            17,
            "hatch_cross_faff13_s3",
            18,
            "hatch_cross_faff13_s4",
            19,
            "hatch_cross_faff13_s4",
            22,
            "hatch_cross_faff13_s4",
          ],
          "fill-opacity": 1,
        },
      },
      {
        id: "gebaeude_hatched_diag",
        type: "fill",
        source: "alkis_data",
        "source-layer": "building",
        minzoom: 13,
        filter: ["!in", "geb_fkt_code", 3012, 3021, 3040, 3041, 3042],
        paint: {
          "fill-pattern": [
            "step",
            ["zoom"],
            "hatch_diag45_faff13_s1",
            16,
            "hatch_diag45_faff13_s2",
            17,
            "hatch_diag45_faff13_s3",
            18,
            "hatch_diag45_faff13_s4",
            19,
            "hatch_diag45_faff13_s4",
            22,
            "hatch_diag45_faff13_s4",
          ],
          "fill-opacity": 1,
        },
      },
      {
        id: "gebaeudestructure_hatched_diag",
        type: "fill",
        source: "alkis_data",
        "source-layer": "buildingstructure",
        minzoom: 13,
        paint: {
          "fill-pattern": [
            "step",
            ["zoom"],
            "hatch_diag135_faff13_s1",
            16,
            "hatch_diag135_faff13_s2",
            17,
            "hatch_diag135_faff13_s3",
            18,
            "hatch_diag135_faff13_s4",
            19,
            "hatch_diag135_faff13_s4",
            22,
            "hatch_diag135_faff13_s4",
          ],
          "fill-opacity": 1,
        },
      },
      {
        id: "landparcel_boutlines",
        type: "line",
        source: "alkis_data",
        "source-layer": "landparcel",
        paint: {
          "line-color": "#FAFF13",
          "line-width": {
            stops: [
              [13, 0.05],
              [21, 2],
            ],
          },
        },
      },
      {
        id: "landparcel_selection",
        type: "line",
        source: "alkis_data",
        "source-layer": "landparcel",
        minzoom: 0,
        maxzoom: 22,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3A7CEB",
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
          "line-width": 3,
        },
      },
      {
        id: "gebaeude_selection",
        type: "line",
        source: "alkis_data",
        "source-layer": "building",
        minzoom: 0,
        maxzoom: 22,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3A7CEB",
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
          "line-width": 3,
        },
      },
      {
        id: "gebaeudestruktur_selection",
        type: "line",
        source: "alkis_data",
        "source-layer": "buildingstructure",
        minzoom: 0,
        maxzoom: 22,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3A7CEB",
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
          "line-width": 3,
        },
      },
      {
        id: "lanparcel_arrows",
        type: "line",
        source: "alkis_data",
        "source-layer": "landparcel_arrows",
        minzoom: 18,
        maxzoom: 24,
        paint: {
          "line-color": "#FAFF13",
          "line-width": {
            stops: [
              [13, 0.05],
              [21, 2],
            ],
          },
          "line-opacity": 1,
        },
      },
      {
        id: "landparcel_arrows_tips",
        type: "symbol",
        source: "alkis_data",
        "source-layer": "landparcel_arrows_tips",
        minzoom: 18,
        maxzoom: 24,
        layout: {
          "icon-image": "arrow_faff13_s1",
          "icon-rotation-alignment": "map",
          "icon-rotate": ["+", ["get", "angle"], -90],
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.02,
            14,
            0.18,
            18,
            0.2,
            22,
            1.12,
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-anchor": "right",
        },
        paint: {
          "icon-color": "#FAFF13",
          "icon-opacity": 1,
        },
      },
      {
        id: "landparcel_arrows_tips_point",
        type: "circle",
        source: "alkis_data",
        "source-layer": "landparcel_arrows_tips",
        paint: {
          "circle-radius": 2,
          "circle-color": "#000000",
        },
        layout: {
          visibility: "none",
        },
      },
      {
        id: "landparcel_point",
        type: "circle",
        source: "alkis_data",
        "source-layer": "landparcel_point",
        layout: {
          visibility: "none",
        },
      },
      {
        id: "landparcel_label",
        type: "symbol",
        source: "alkis_data",
        "source-layer": "landparcel_point",
        minzoom: 18,
        maxzoom: 24,
        layout: {
          "text-field": [
            "case",
            [
              "any",
              ["!", ["has", "nen"]],
              ["==", ["get", "nen"], null],
              ["==", ["to-string", ["get", "nen"]], ""],
            ],
            ["to-string", ["get", "zae"]],
            [
              "format",
              ["to-string", ["get", "zae"]],
              {},
              "\n",
              {},
              "—",
              {
                "font-scale": 0.8,
              },
              "\n",
              {},
              ["to-string", ["get", "nen"]],
              {},
            ],
          ],
          // "text-field": [
          //   "concat",
          //   ["to-string", ["coalesce", ["get", "angle"], ""]],
          //   " - ",
          //   ["to-string", ["coalesce", ["get", "text_anchor"], "center"]],
          // ],
          "text-font": ["Open Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 1, 22, 26],
          "text-line-height": 1,
          "text-anchor": ["coalesce", ["get", "text_anchor"], "center"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#FAFF13",
        },
      },
    ],
  };

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: backgroundStyle,
      // style: "https://tiles.cismet.de/alkisY/json-flurstuecke.style.json",
      // style: "https://tiles.cismet.de/alkisY/flurstuecke.style.json",
      // style: "https://tiles.cismet.de/alkis_laak/flurstuecke.style.json",

      center: [lng, lat],
      zoom: zoom,
      opacity: 1,
      maxZoom: 23,
      minZoom: 10,
    });

    map.current.on("error", (e) => {
      console.error("Map error:", e.error || e);
    });

    map.current.on("style.loaderror", (e) => {
      console.error("Style load error:", e.error || e);
    });

    map.current.on("sourcedata", (e) => {
      if (e.isSourceLoaded === false && e.sourceDataType === "metadata") {
        console.warn(`Metadata for source ${e.sourceId} not loaded`);
      }
    });

    map.current.on("data", (e) => {
      if (e.dataType === "source" && e.tile && e.tile.state === "errored") {
        console.warn("Tile load error:", e.tile);
      }
    });
    map.current.on("load", function () {
      // for (const vectorStyle of vectorStyles) {
      //   // Fetch and add additional layers from external style JSON
      //   const additionalStyleUrl = vectorStyle;

      //   fetch(additionalStyleUrl)
      //     .then((response) => response.json())
      //     .then((additionalStyle) => {
      //       // Add glyphs and sprite to the map

      //       const newStyle = {
      //         ...map.current.getStyle(),
      //         //sprite: { default: additionalStyle.sprite },
      //       };
      //       if (additionalStyle.sprite) {
      //         newStyle.sprite = additionalStyle.sprite;
      //       }
      //       if (additionalStyle.glyphs) {
      //         newStyle.glyphs = additionalStyle.glyphs;
      //       }

      //       map.current.setStyle(newStyle);

      //       console.log('sprites', map.current.getStyle().sprite);

      //       // Add sources from the additional style
      //       Object.keys(additionalStyle.sources).forEach((sourceName) => {
      //         map.current.addSource(
      //           sourceName,
      //           additionalStyle.sources[sourceName],
      //         );
      //       });

      //       // Add layers from the additional style
      //       additionalStyle.layers.forEach((layer) => {
      //         map.current.addLayer(layer);
      //       });
      //     });
      // }
      // console.log('map.current', map.current);
      map.current.addControl(new maplibregl.NavigationControl(), "top-left");
    });
  });
  // useEffect(() => {
  //   if (!map.current) return;

  //   const addVectorStyles = async () => {
  //     const style = backgroundStyle;
  //     console.log("xxx internalStyle", JSON.stringify(style, null, 2));

  //     for (const vectorStyle of vectorStyles) {
  //       const response = await fetch(vectorStyle);
  //       const additionalStyle = await response.json();

  //       if (additionalStyle.sprite) {
  //         style.sprite = additionalStyle.sprite;
  //       }
  //       if (additionalStyle.glyphs) {
  //         style.glyphs = additionalStyle.glyphs;
  //       }

  //       Object.keys(additionalStyle.sources).forEach((sourceName) => {
  //         if (!style.sources[sourceName]) {
  //           style.sources[sourceName] = additionalStyle.sources[sourceName];
  //         }
  //       });

  //       additionalStyle.layers.forEach((layer) => {
  //         if (!style.layers.find((l) => l.id === layer.id)) {
  //           style.layers.push(layer);
  //         }
  //       });
  //     }

  //     map.current.setStyle(style);
  //   };

  //   addVectorStyles();
  // }, [vectorStyles]);

  return (
    <div
      className="map-wrap"
      style={{ background: "darkgrey", position: "relative" }}
    >
      <div ref={mapContainer} className="map" />
      {currentZoom !== null && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            padding: "4px 10px",
            borderRadius: "4px",
            fontSize: "14px",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          Zoom: {currentZoom}
        </div>
      )}
    </div>
  );
}
