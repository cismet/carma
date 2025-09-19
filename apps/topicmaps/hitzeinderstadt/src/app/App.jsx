import { useEffect } from "react";
import { useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import HitzeKarte from "./HitzeKarte";
import "./index.css";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
if (typeof global === "undefined") {
  window.global = window;
}

function App() {
  const [poiColors, setPoiColors] = useState();

  useEffect(() => {
    document.title = "Hitze in Wuppertal";
  }, []);

  return (
    <TopicMapContextProvider
      appKey="carma.apps.topicmaps.HitzeInderStadt"
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      mapEPSGCode="3857"
      referenceSystem={MappingConstants.crs3857}
      // referenceSystemDefinition={MappingConstants.proj4crs25832def}
      // mapEPSGCode="25832"
      // referenceSystem={MappingConstants.crs25832}
    >
      <HitzeKarte />
    </TopicMapContextProvider>
  );
}

export default App;
