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
import "./notification.css";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearch from "./components/FuzzySearch";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { RoutedMapLocateControl } from "@carma-mapping/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompress, faExpand } from "@fortawesome/free-solid-svg-icons";
import ContactButton from "./components/ContactButton";
import ZoomControls from "./components/ZoomControls";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@saarlouis.de";
  const [gazData, setGazData] = useState([]);
  const urlPrefix = window.location.origin + window.location.pathname;
  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);
    setGazData(data || []);
  };

  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_saarlouis.json");
  }, []);

  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Saarlouis"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      baseLayerConf={config.overridingBaseLayerConf}
      infoBoxPixelWidth={370}
    >
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <ZoomControls />
          </Control>

          <Control position="topleft" order={50}>
            <ControlButtonStyler
              title={
                document.fullscreenElement
                  ? "Vollbildmodus beenden"
                  : "Vollbildmodus"
              }
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              dataTestId="full-screen-control"
            >
              <FontAwesomeIcon
                icon={document.fullscreenElement ? faCompress : faExpand}
              />
            </ControlButtonStyler>
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          <Control position="topleft" order={70}>
            <ContactButton emailaddress={email} />
          </Control>
          <Control position="bottomleft" order={10}>
            <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
              <FuzzySearch gazLocalData={gazData} />
            </div>
          </Control>
        </ControlLayout>
      </div>
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
        contactButtonEnabled={false}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
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
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
      >
        <TopicMapSelectionContent />
      </HeavyRainHazardMap>
    </TopicMapContextProvider>
  );
}

export default App;
