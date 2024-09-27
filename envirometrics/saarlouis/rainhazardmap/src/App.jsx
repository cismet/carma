import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";

import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";

import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import versionData from "./version.json";

import config from "./config";
import { getApplicationVersion } from "@carma-commons/utils";
import { getCollabedHelpComponentConfig } from "./getCollabedHelpComponentConfig";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@saarlouis.de";
  const [gazData, setGazData] = useState([]);

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);
    setGazData(data || []);
  };

  useEffect(() => {
    getGazData(setGazData, "/data/adressen_saarlouis.json");
  }, []);

  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Saarlouis"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      baseLayerConf={config.overridingBaseLayerConf}
      infoBoxPixelWidth={370}
    >
      <HeavyRainHazardMap
        appMenu={
          <GenericModalApplicationMenu
            {...getCollabedHelpComponentConfig({
              version,
              reactCismapRHMVersion: "_",
              email,
            })}
          />
        }
        emailaddress={email}
        applicationMenuTooltipString="Anleitung | Hintergrund"
        initialState={config.initialState}
        config={config.config}
        homeZoom={13}
        homeCenter={[49.31780796845044, 6.75342544913292]}
        modeSwitcherTitle="Starkregengefahrenkarte Saarlouis"
        documentTitle="Starkregengefahrenkarte Saarlouis"
        gazData={gazData}
        customFeatureInfoUIs={[<div>xxx</div>]}
      ></HeavyRainHazardMap>
    </TopicMapContextProvider>
  );
}

export default App;
