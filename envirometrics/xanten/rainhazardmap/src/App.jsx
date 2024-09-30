import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";

import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import versionData from "./version.json";

import config from "./config";
import { getApplicationVersion } from "@carma-commons/utils";
// import { getCollabedHelpComponentConfig } from "./getCollabedHelpComponentConfig";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@xanten.de";
  const footerLogoUrl = "/images/Signet_AIS_RZ.png";
  const [gazData, setGazData] = useState([]);

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data || []);
  };

  const appKey = "cismetRainhazardMap";
  useEffect(() => {
    getGazData(setGazData, "/data/adressen_xanten.json");
  }, []);

  return (
    <TopicMapContextProvider
      appKey={appKey + ".Xanten"}
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
              footerLogoUrl,
              email,
            })}
          />
        }
        applicationMenuTooltipString="Anleitung | Hintergrund"
        initialState={config.initialState}
        emailaddress={email}
        config={config.config}
        homeZoom={13}
        homeCenter={[51.658873404435404, 6.437902450561524]}
        modeSwitcherTitle="AIS Starkregenvorsorge Xanten"
        documentTitle="AIS Starkregenvorsorge Xanten"
        gazData={gazData}
      />
    </TopicMapContextProvider>
  );
}

export default App;
