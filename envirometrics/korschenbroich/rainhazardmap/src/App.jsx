import React, { useEffect, useState, useContext } from "react";
import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import config from "./config";
import versionData from "./version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import CismapLayer from "react-cismap/CismapLayer";
import "./notification.css";

import { notification } from "antd";
// import NotesDisplay from './NotesDisplay';
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/korschenbroich";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import {
  TopicMapSelectionContent,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  Control,
  useAttributionControlStyling,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import ContactButton from "./components/ContactButton";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { isAreaTypeWithGEP } from "@carma-commons/resources";

function App() {
  const email = "yvonne.tuerks@korschenbroich.de";
  const urlPrefix = window.location.origin + window.location.pathname;
  const [hinweisShown, setHinweisShown] = useState(false);
  const [gazData, setGazData] = useState([]);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const { attributionHeight } = useAttributionControlStyling({
    styles: { marginLeft: "16px", marginTop: "2px" },
  });
  const version = getApplicationVersion(versionData);
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
    setGazData(data || []);
  };

  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_korschenbroich.json");
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
        applicationMenuTooltipString="Anleitung | Hintergrund"
        appMenu={
          <GenericModalApplicationMenu
            {...getCollabedHelpComponentConfig({
              versionString: version,
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
        initialState={config.initialState}
        config={config.config}
        homeZoom={17}
        homeCenter={[51.159716445861676, 6.578933000564575]}
        modeSwitcherTitle="AIS Starkregenvorsorge Korschenbroich"
        documentTitle="AIS Korschenbroich"
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
      >
        {/* {contextHolder} */}

        <CismapLayer
          {...{
            type: "vector",
            style: "https://tiles.cismet.de/kanal_kb_abschnitte/style.json",
            pane: "additionalLayers4",
            opacity: 1,
            maxSelectionCount: 1,
            onSelectionChanged: (e) => {
              if (e.hits === undefined) {
                notification.destroy("SchachtInfoDisplay");
              } else {
                const selectedFeature = e.hits[0];
                // console.log(
                //   "xxxy selectedFeature",
                //   JSON.stringify(selectedFeature, null, 2),
                //   selectedFeature,
                // );
                if (
                  selectedFeature &&
                  selectedFeature.source === "kanal-knoten-source"
                ) {
                  notification.destroy("SchachtInfoDisplay");

                  notification.info({
                    key: "SchachtInfoDisplay",
                    style: { width: 430, marginTop: 30, marginRight: -13 },
                    duration: 0,
                    showProgress: true,
                    message: (
                      <span>
                        <b>
                          Schachtbezeichnung:{" "}
                          {selectedFeature.properties.Bezeichnun}
                        </b>
                      </span>
                    ),
                    description:
                      "Schachtdeckelhöhe [m ü. NHN]: " +
                      parseFloat(
                        selectedFeature.properties.OKSchachtd
                      ).toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }),
                    placement: "topRight",
                    onClose: () => {
                      setHinweisShown(false);
                    },
                  });
                }
              }
            },
          }}
        />
        <TopicMapSelectionContent />
      </HeavyRainHazardMap>
    </>
  );
}

export default App;
