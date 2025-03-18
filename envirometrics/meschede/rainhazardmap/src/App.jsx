import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import { notification } from "antd";
import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import ProjGeoJson from "react-cismap/ProjGeoJson";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import versionData from "./version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { getCollabedHelpComponentConfig } from "@carma-pecher-collab/meschede";
import meschedeConfig from "./meschede";
import "./notification.css";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearch from "./components/FuzzySearch";
import { TopicMapSelectionContent } from "@carma-apps/portals";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@meschede.de";
  const urlPrefix = window.location.origin + window.location.pathname;

  const [gazData, setGazData] = useState([]);
  const [gewaesserData, setGewaesserData] = useState([]);
  const [gewInfoShown, setGewInfoShown] = useState(false);
  const gewInfoShownRef = React.useRef(gewInfoShown);
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
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Meschede"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      baseLayerConf={meschedeConfig.overridingBaseLayerConf}
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
      <FuzzySearch gazLocalData={gazData} />
    </TopicMapContextProvider>
  );
}

export default App;
