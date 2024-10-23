import HeavyRainHazardMap from "@cismet-dev/react-cismap-envirometrics-maps/HeavyRainHazardMap";
import { notification } from "antd";
import React, { useEffect, useState } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import ProjGeoJson from "react-cismap/ProjGeoJson";
import { md5FetchJSON } from "react-cismap/tools/fetching";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import versionData from "./version.json";
import config from "./config";
import { getApplicationVersion } from "@carma-commons/utils";
import {
  getCollabedHelpComponentConfig,
  textElementsForOverlays,
} from "@carma-pecher-collab/euskirchen";
import NotesDisplay from "./NotesDisplay";
import footerLogoUrl from "./assets/images/Signet_AIS_RZ.png";

function App() {
  const version = getApplicationVersion(versionData);
  const email = "starkregen@kreis-euskirchen.de";
  const urlPrefix = window.location.origin + window.location.pathname;

  const [gazData, setGazData] = useState([]);
  const [hinweisData, setHinweisData] = useState([]);

  const getHinweisData = async (setHinweisData, url) => {
    const prefix = "HinweisDataForStarkregengefahrenkarteByCismet";
    const data = await md5FetchJSON(prefix, url);

    const features = [];
    let id = 1;
    for (const d of data) {
      const f = {
        type: "Feature",
        id: id++,
        properties: d,
        geometry: d.geojson,
        crs: {
          type: "name",
          properties: {
            name: "urn:ogc:def:crs:EPSG::25832",
          },
        },
      };

      f.properties.beschreibung =
        textElementsForOverlays[f.properties.beschreibung_key];
      features.push(f);
    }

    setHinweisData(features || []);
  };

  const getGazData = async (
    setGazData,
    adressUrl,
    kommunenUrl,
    ortslagenUrl,
  ) => {
    const prefix = "GazDataForStarkregengefahrenkarteByCismet";
    const adressen = await md5FetchJSON(prefix + "addr", adressUrl);
    const kommunen = await md5FetchJSON(prefix + "komm", kommunenUrl);
    const ortslagen = await md5FetchJSON(prefix + "komm", ortslagenUrl);
    const kommunenWithPrefix = kommunen.map((item) => {
      return {
        ...item,
        string: "KOM " + item.string,
      };
    });
    const ortslagenWithPrefix = ortslagen.map((item) => {
      //split the string into the part before the blank and the part inside the parenthesis
      const splitString = item.string.split(" (");
      //get the ortslagenname which is the part before the blank
      const ortslagenName = splitString[0];
      //get the kommunenname which is the part inside the parenthesis
      const kommunenName = splitString[1].slice(0, -1);

      return {
        ...item,
        string: kommunenName + "-" + ortslagenName,
      };
    });

    setGazData(
      [
        ...kommunen,
        ...ortslagenWithPrefix,
        ...ortslagen,
        ...adressen,
        ...kommunenWithPrefix,
      ] || [],
    );
  };

  useEffect(() => {
    getGazData(
      setGazData,
      urlPrefix + "/data/adressen_euskirchen.json",
      urlPrefix + "/data/kommunen.json",
      urlPrefix + "/data/ortslagen.json",
    );
    getHinweisData(setHinweisData, urlPrefix + "/data/overlay.json");
  }, []);
  return (
    <TopicMapContextProvider
      appKey={"cismetRainhazardMap.Euskirchen"}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      baseLayerConf={config.overridingBaseLayerConf}
      infoBoxPixelWidth={370}
      maskingPolygon="POLYGON ((653674.603 5986240.643, 653674.603 7372844.430, 1672962.694 7372844.430, 1672962.694 5986240.643, 653674.603 5986240.643))"
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
        homeZoom={13}
        homeCenter={[50.651147537357396, 6.792640686035157]}
        modeSwitcherTitle="AIS Starkregenvorsorge Kreis Euskirchen"
        documentTitle="AIS Starkregenvorsorge Kreis Euskirchen"
        gazData={gazData}
        gazetteerSearchPlaceholder="Kommune | Ortslage | Adresse"
        customFeatureInfoUIs={[<div></div>]}
      >
        <NotesDisplay hinweisData={hinweisData} />
      </HeavyRainHazardMap>
    </TopicMapContextProvider>
  );
}

export default App;
