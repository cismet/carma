import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "./version.json";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/olpe";
import olpeConfig from "./config";
import "./notification.css";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearch from "./components/FuzzySearch";
import { TopicMapSelectionContent } from "@carma-apps/portals";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@olpe.de";
  const urlPrefix = window.location.origin + window.location.pathname;
  const [gazData, setGazData] = useState([]);

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data);
  };
  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_olpe.json");
  }, []);
  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Olpe"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      baseLayerConf={olpeConfig.overridingBaseLayerConf}
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
        emailaddress={email}
        initialState={olpeConfig.initialState}
        config={olpeConfig.config}
        homeZoom={14}
        minZoom={12}
        homeCenter={[51.0301991586838, 7.850940702483058]}
        modeSwitcherTitle="AIS Starkregenvorsorge Olpe"
        documentTitle="Starkregengefahrenkarte Olpe"
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
      >
        <TopicMapSelectionContent />
      </HeavyRainHazardMap>
      <FuzzySearch gazLocalData={gazData} />
    </TopicMapContextProvider>
  );
}

export default App;
