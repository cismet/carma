import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
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

function App() {
  const email = "yvonne.tuerks@korschenbroich.de";
  const urlPrefix = window.location.origin + window.location.pathname;
  const [hinweisShown, setHinweisShown] = useState(false);
  const [gazData, setGazData] = useState([]);
  const version = getApplicationVersion(versionData);
  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);
    setGazData(data || []);
  };

  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_korschenbroich.json");
  }, []);

  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Korschenbroich"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      infoBoxPixelWidth={370}
      baseLayerConf={config.overridingBaseLayerConf}
    >
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
        emailaddress={email}
        initialState={config.initialState}
        config={config.config}
        homeZoom={17}
        homeCenter={[51.159716445861676, 6.578933000564575]}
        modeSwitcherTitle="AIS Starkregenvorsorge Korschenbroich"
        documentTitle="AIS Korschenbroich"
        gazData={gazData}
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
                        selectedFeature.properties.OKSchachtd,
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
      </HeavyRainHazardMap>
    </TopicMapContextProvider>
  );
}

export default App;
