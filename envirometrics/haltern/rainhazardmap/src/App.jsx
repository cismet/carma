import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import { getApplicationVersion } from "@carma-commons/utils";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/haltern";
import versionData from "./version.json";
import config from "./config";
import "./notification.css";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearch from "./components/FuzzySearch";
import { TopicMapSelectionContent } from "@carma-apps/portals";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@haltern.de";
  const [gazData, setGazData] = useState([]);
  const urlPrefix = window.location.origin + window.location.pathname;

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data);
  };
  useEffect(() => {
    getGazData(setGazData, urlPrefix + "data/adressen_haltern.json");
  }, []);
  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Haltern"}
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
        emailaddress={email}
        initialState={config.initialState}
        config={config.config}
        homeZoom={17}
        homeCenter={[51.742081808761874, 7.1898638262064205]}
        modeSwitcherTitle="AIS Starkregenvorsorge Haltern am See"
        documentTitle="Starkregengefahrenkarte Haltern am See"
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
