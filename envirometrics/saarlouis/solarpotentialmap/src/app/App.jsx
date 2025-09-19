import { useEffect } from "react";
import { useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import Karte from "./Map";
import "./index.css";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";

if (typeof global === "undefined") {
  window.global = window;
}
const year = new Date().getFullYear();

function App() {
  const [poiColors, setPoiColors] = useState();

  useEffect(() => {
    document.title = "Solarpotenzial in Saarlouis";
  }, []);

  return (
    <TopicMapContextProvider
      appKey="carma.apps.sls.solarpotentialmap"
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      mapEPSGCode="3857"
      referenceSystem={MappingConstants.crs3857}
      baseLayerConf={{
        namedStyles: {
          default: { opacity: 1.0 },
          night: {
            opacity: 0.9,
            "css-filter": "filter:grayscale(0.9)brightness(0.9)invert(1)",
          },
          blue: {
            opacity: 1.0,
            "css-filter":
              "filter:sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9) invert(0)",
          },
        },
        defaults: {
          wms: {
            format: "image/png",
            tiled: true,
            maxZoom: 22,
            opacity: 0.6,
            version: "1.1.1",
          },
        },
        namedLayers: {
          slDOPcismet2: {
            type: "wms",
            url: "https://lvgl-saar-ortho.cismet.de/geoserver/ows?&version=1.1.1",
            transparent: "true",
            layers: "ortho:sls_ortho_pyramid",
            styles: "ortho:rgb",
            tiled: "false",
            version: "1.1.1",
            pane: "backgroundLayers",
            attribution: "Luftbild: &copy; LVGL Saarland",
          },
          basemap_grey: {
            type: "vector",
            style:
              "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
            attribution: "© basemap.de / BKG " + year,
          },
          basemap_color: {
            type: "vector",
            style:
              "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json",
            attribution: "© basemap.de / BKG " + year,
          },
          basemap_relief: {
            type: "vector",
            style:
              "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
            attribution: "© basemap.de / BKG " + year,
          },
        },
      }}
    >
      <Karte />
    </TopicMapContextProvider>
  );
}

export default App;
