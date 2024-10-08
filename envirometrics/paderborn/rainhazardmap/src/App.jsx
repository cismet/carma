import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import paderbornConfig from "./config";
import versionData from "./version.json";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/paderborn";
import { getApplicationVersion } from "@carma-commons/utils";
import "./notification.css";

function App() {
  const appKey = "cismetRainhazardMap.Paderborn";
  const email = "starkregen@paderborn.de";
  const version = getApplicationVersion(versionData);
  const footerLogoUrl = "/images/Signet_AIS_RZ.png";
  const [gazData, setGazData] = useState([]);

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data);
  };
  useEffect(() => {
    getGazData(setGazData, "/data/adressen_paderborn.json");
  }, []);
  return (
    <TopicMapContextProvider
      appKey={appKey + ".Paderborn"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      baseLayerConf={paderbornConfig.overridingBaseLayerConf}
      infoBoxPixelWidth={370}
    >
      <HeavyRainHazardMap
        appMenu={
          <GenericModalApplicationMenu
            {...getCollabedHelpComponentConfig({
              version,
              reactCismapRHMVersion: "",
              footerLogoUrl,
              email,
            })}
          />
        }
        emailaddress={email}
        initialState={paderbornConfig.initialState}
        config={paderbornConfig.config}
        homeZoom={14}
        homeCenter={[51.71905, 8.75439]}
        modeSwitcherTitle="AIS Starkregenvorsorge Paderborn"
        documentTitle="Starkregengefahrenkarte Paderborn"
        gazData={gazData}
      />
    </TopicMapContextProvider>
  );
}

export default App;
