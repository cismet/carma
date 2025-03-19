import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import EnviroMetricMap from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import CrossTabCommunicationControl from "react-cismap/CrossTabCommunicationControl";
import CrossTabCommunicationContextProvider from "react-cismap/contexts/CrossTabCommunicationContextProvider";
import config from "./config";
import versionData from "./version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import NotesDisplay from "./NotesDisplay";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/starkregengefahrenkarte";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import FuzzySearch from "./app/components/FuzzySearch";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

function App() {
  const email = "starkregen@stadt.wuppertal.de";
  const [hinweisData, setHinweisData] = useState([]);
  const version = getApplicationVersion(versionData);
  const getHinweisData = async (setHinweisData, url) => {
    const prefix = "HinweisDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    const features = [];
    let id = 1;
    for (const d of data) {
      features.push({
        type: "Feature",
        id: id++,
        properties: d,
        geometry: d.geojson,
        crs: {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::25832",
          },
        },
      });
    }
    console.log("yy hinweisData", features);

    setHinweisData(features || []);
  };

  useEffect(() => {
    getHinweisData(setHinweisData, config.config.hinweisDataUrl);
  }, []);

  return (
    <CrossTabCommunicationContextProvider
      role="sync"
      token="floodingAndRainhazardSyncWupp"
    >
      <TopicMapContextProvider
        appKey={"cismetRainhazardMap.Wuppertal"}
        referenceSystem={MappingConstants.crs3857}
        referenceSystemDefinition={MappingConstants.proj4crs3857def}
        infoBoxPixelWidth={370}
      >
        <EnviroMetricMap
          applicationMenuTooltipString="Anleitung | Hintergrund"
          appMenu={
            <GenericModalApplicationMenu
              {...getCollabedHelpComponentConfig({
                versionString: version,
                reactCismapRHMVersion: "_",

                email,
              })}
            />
          }
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
          emailaddress={email}
          initialState={config.initialState}
          config={config.config}
          homeZoom={18}
          homeCenter={[51.27202324060668, 7.20162372978018]}
          modeSwitcherTitle="Starkregengefahrenkarte"
          documentTitle="Starkregengefahrenkarte Wuppertal"
        >
          <TopicMapSelectionContent />
          <NotesDisplay hinweisData={hinweisData} />
          <CrossTabCommunicationControl hideWhenNoSibblingIsPresent={true} />
        </EnviroMetricMap>
        <FuzzySearch />
      </TopicMapContextProvider>
    </CrossTabCommunicationContextProvider>
  );
}

export default App;
