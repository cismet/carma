import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import versionData from "./version.json";
import config from "./config";
import { getApplicationVersion } from "@carma-commons/utils";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/xanten";
import "./notification.css";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearch from "./components/FuzzySearch";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { useAttributionControlStyling } from "@carma-mapping/map-controls-layout";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@xanten.de";
  const [gazData, setGazData] = useState([]);
  const urlPrefix = window.location.origin + window.location.pathname;
  const { attributionHeight } = useAttributionControlStyling({
    styles: { marginLeft: "16px", marginTop: "2px" },
  });

  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data || []);
  };

  const appKey = "cismetRainhazardMap";
  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_xanten.json");
  }, []);

  return (
    <>
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
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
        >
          <TopicMapSelectionContent />
        </HeavyRainHazardMap>
        <FuzzySearch
          gazLocalData={gazData}
          attributionHeight={attributionHeight}
        />
      </TopicMapContextProvider>
    </>
  );
}

export default App;
