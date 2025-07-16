import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import { notification } from "antd";
import React, { useEffect, useState, useContext } from "react";
import ProjGeoJson from "react-cismap/ProjGeoJson";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import versionData from "./version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/meschede";
import meschedeConfig from "./meschede";
import "./notification.css";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";
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
  const version = getApplicationVersion(versionData);
  const email = "starkregen@meschede.de";
  const urlPrefix = window.location.origin + window.location.pathname;

  const [gazData, setGazData] = useState([]);
  const [gewaesserData, setGewaesserData] = useState([]);
  const [gewInfoShown, setGewInfoShown] = useState(false);
  const gewInfoShownRef = React.useRef(gewInfoShown);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  const { attributionHeight } = useAttributionControlStyling({
    styles: { marginLeft: "16px", marginTop: "2px" },
  });

  console.log("xxx attributionHeight", attributionHeight);

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

  useEffect(() => {
    gewInfoShownRef.current = gewInfoShown;
  }, [gewInfoShown]);
  const getGazData = async (setGazData, url) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    setGazData(data || []);
  };
  const getGewData = async (setGewaesserData, url) => {
    const prefix = "GewDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    const features = [];
    let id = 1;
    for (const f of data.features) {
      features.push({
        id: id++,
        ...f,
        crs: {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::25832",
          },
        },
      });
    }
    setGewaesserData(features || []);
  };
  useEffect(() => {
    getGazData(setGazData, urlPrefix + "/data/adressen_meschede.json");
    getGewData(setGewaesserData, urlPrefix + "/data/gewaesser_meschede.json");
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
        contactButtonEnabled={false}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        emailaddress={email}
        applicationMenuTooltipString="Anleitung | Hintergrund"
        initialState={meschedeConfig.initialState}
        config={meschedeConfig.config}
        homeZoom={15}
        homeCenter={[51.34440567699394, 8.286523818969728]}
        modeSwitcherTitle="AIS Starkregenvorsorge Meschede"
        documentTitle="AIS Starkregenvorsorge Meschede"
        gazData={gazData}
        customFeatureInfoUIs={[<div>xxx</div>]}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
      >
        <TopicMapSelectionContent />
        <ProjGeoJson
          featureClickHandler={(e) => {
            if (gewInfoShownRef.current === false) {
              notification.info({
                style: { width: 430, marginTop: 30, marginRight: -13 },

                message:
                  e.target.feature.properties.ZUSNAME ||
                  e.target.feature.properties.GEWNAME,
                description:
                  "Im Bereich der Hochwassergefahrengewässer sind die Hochwassergefahrenkarten zu berücksichtigen.",
                placement: "topRight",
                onClose: () => {
                  setGewInfoShown(false);
                },
              });
              setGewInfoShown(true);
            }
          }}
          key={gewaesserData.length + "gewaesser"}
          style={(feature) => {
            return {
              fillColor: "#525C55",
              fillOpacity: 0.9,
              weight: 0,
            };
          }}
          opacity={1}
          featureCollection={gewaesserData}
        />
      </HeavyRainHazardMap>
    </>
  );
}

export default App;
