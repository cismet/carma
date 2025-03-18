import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import versionData from "./version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/emsdetten";
import config from "./config";
import "./notification.css";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearch from "./components/FuzzySearch";
import { TopicMapSelectionContent } from "@carma-apps/portals";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@emsdetten.de";
  const urlPrefix = window.location.origin + window.location.pathname;
  const [gazData, setGazData] = useState([]);

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data || []);
  };
  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_emsdetten.json");
  }, []);

  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Emsdetten"}
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
        applicationMenuTooltipString="Anleitung | Hintergrund"
        initialState={config.initialState}
        config={config.config}
        homeZoom={18}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        homeCenter={[52.1734, 7.52781]}
        modeSwitcherTitle="Starkregenkarte Emsdetten"
        documentTitle="Starkregenkarte Emsdetten"
        gazData={gazData}
      >
        <TopicMapSelectionContent />
      </HeavyRainHazardMap>
      <FuzzySearch gazLocalData={gazData} />
    </TopicMapContextProvider>
  );
}

export default App;
