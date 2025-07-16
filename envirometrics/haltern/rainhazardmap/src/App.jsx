import React, { useContext, useEffect, useState } from "react";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import { getApplicationVersion } from "@carma-commons/utils";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/haltern";
import versionData from "./version.json";
import config from "./config";
import "./notification.css";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlLayout,
  useAttributionControlStyling,
} from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import ContactButton from "./components/ContactButton";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { isAreaTypeWithGEP } from "@carma-commons/resources";
import {
  useSelection,
  useSelectionTopicMap,
  TopicMapSelectionContent,
} from "@carma-apps/portals";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@haltern.de";
  const [gazData, setGazData] = useState([]);
  const urlPrefix = window.location.origin + window.location.pathname;
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const { attributionHeight } = useAttributionControlStyling({
    styles: { marginLeft: "16px", marginTop: "2px" },
  });

  const ifDesktop = responsiveState === "normal";
  const { setSelection } = useSelection();
  useSelectionTopicMap();
  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }

    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaTypeWithGEP(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };
  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data);
  };
  useEffect(() => {
    getGazData(setGazData, urlPrefix + "data/adressen_haltern.json");
  }, []);
  return (
    <>
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
            <ZoomControl />
          </Control>

          <Control position="topleft" order={50}>
            <FullscreenControl />
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
            <div className="h-full w-full pl-2">
              <div
                className="custom-left-control"
                style={{
                  marginBottom: ifDesktop ? "0" : attributionHeight + 4,
                }}
              >
                <LibFuzzySearch
                  gazData={gazData}
                  onSelection={onGazetteerSelection}
                  pixelwidth={
                    responsiveState === "normal"
                      ? "300px"
                      : windowSize.width - gap
                  }
                  placeholder="Adresssuche"
                />
              </div>
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
        contactButtonEnabled={false}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
      >
        <TopicMapSelectionContent />
      </HeavyRainHazardMap>
    </>
  );
}

export default App;
