import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";

import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";

import versionData from "./version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { getCollabedHelpComponentConfig } from "./getCollabedHelpComponentConfig";
import config from "./config";
import "./notification.css";

function App() {
  const footerLogoUrl = undefined;
  const version = getApplicationVersion(versionData);
  const email = "starkregen@huerth.de";
  const [gazData, setGazData] = useState([]);
  const urlPrefix = window.location.origin + window.location.pathname;

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);
    setGazData(data || []);
  };

  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_huerth.json");
  }, []);

  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Huerth"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      baseLayerConf={config.overridingBaseLayerConf}
      infoBoxPixelWidth={370}
      appMenuVisible={false}
    >
      <HeavyRainHazardMap
        appMenu={
          <GenericModalApplicationMenu
            {...getCollabedHelpComponentConfig({
              version,
              reactCismapRHMVersion: "_",
              footerLogoUrl,
              email,
            })}
          />
        }
        emailaddress={email}
        applicationMenuTooltipString="Anleitung | Hintergrund"
        initialState={config.initialState}
        config={config.config}
        homeZoom={14}
        homeCenter={[50.883818568649005, 6.8746743723750114]}
        modeSwitcherTitle="Starkregengefahrenkarte Hürth"
        documentTitle="Starkregengefahrenkarte Hürth"
        gazData={gazData}
      ></HeavyRainHazardMap>
    </TopicMapContextProvider>
  );
}

export default App;
