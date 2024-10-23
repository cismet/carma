import { useEffect } from "react";

import "./App.css";
import { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import { md5FetchText, fetchJSON } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";

import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { getClusterIconCreatorFunction } from "react-cismap/tools/uiHelper";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import MyMenu from "./Menu";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import getGTMFeatureStyler from "react-cismap/topicmaps/generic/GTMStyler";
import { addSVGToProps } from "react-cismap/tools/svgHelper";
import { MappingConstants } from "react-cismap";

const host = "https://wupp-topicmaps-data.cismet.de";

const getGazData = async (setGazData) => {
  const prefix = "GazDataForStories";
  const sources = {};
  sources.adressen = await md5FetchText(prefix, host + "/data/3857/adressen.json");
  sources.bezirke = await md5FetchText(prefix, host + "/data/3857/bezirke.json");
  sources.quartiere = await md5FetchText(prefix, host + "/data/3857/quartiere.json");
  sources.pois = await md5FetchText(prefix, host + "/data/3857/pois.json");
  sources.kitas = await md5FetchText(prefix, host + "/data/3857/kitas.json");

  const gazData = getGazDataForTopicIds(sources, [
    "pois",
    "kitas",
    "bezirke",
    "quartiere",
    "adressen",
  ]);

  setGazData(gazData);
};

const convertPOIItemsToFeature = async (itemIn) => {
  let item = await addSVGToProps(
    itemIn,
    (i) => i.signatur || i?.mainlocationtype?.signatur || "Platz.svg"
  );
  const text = item?.name || "Kein Name";
  const type = "Feature";
  const selected = false;
  const geometry = item?.geojson;

  let aktiv = true;

  if (item?.info && item.info.match(/^Kostenlose Bürgertestung .ab \d+.\d+/)) {
    const regExp = /\(ab ([^)]+)\)/;
    const matches = regExp.exec(item?.info);
    let result = matches[1];
    if (!result.endsWith(".")) {
      result = result + ".";
    }

    const dateStringArr = (result + "2021").split(".");

    const ab = new Date(
      parseInt(dateStringArr[2]),
      parseInt(dateStringArr[1] - 1),
      parseInt(dateStringArr[0])
    );
    const now = new Date();

    if (ab < now) {
      aktiv = true;
    } else {
      aktiv = false;
    }
  }

  if (
    item?.name?.toLowerCase().includes("impfzentrum") ||
    item?.name?.toLowerCase().includes("mobiles impfangebot")
  ) {
    item.color = "#74000B";
  } else if (aktiv === true) {
    item.color = "#CB0D0D";
  } else {
    item.color = "#757774";
  }

  const info = {
    header: item?.mainlocationtype?.lebenslagen?.join(","),
    title: text,
    additionalInfo: item?.info || "",
    subtitle: item?.adresse || "",
  };
  item.info = info;

  return {
    text,
    type,
    selected,
    geometry,
    crs: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::25832",
      },
    },
    properties: item,
  };
};

const mapTitle = "Corona-Präventionskarte";
function App() {
  const [gazData, setGazData] = useState([]);
  useEffect(() => {
    document.title = mapTitle;
    getGazData(setGazData);
  }, []);
  return (
    <TopicMapContextProvider
      appKey='CoronaPraeventionskarteWuppertal.TopicMap'
      featureItemsURL={"https://wupp-topicmaps-data.cismet.de/data/poi.data.json"}
      getFeatureStyler={getGTMFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertPOIItemsToFeature}
      clusteringOptions={{
        iconCreateFunction: getClusterIconCreatorFunction(30, (props) => props.color),
      }}
      itemFilterFunction={() => {
        return (item) => item?.mainlocationtype?.name?.toLowerCase().includes("corona");
        // item?.name?.toLowerCase().includes("test");
      }}
      clusteringEnabled={true}
      getColorFromProperties={(props) => props.color}
      titleFactory={() => {
        return (
          <div>
            <b>{mapTitle}</b>
          </div>
        );
      }}
    >
      <TopicMapComponent
        modalMenu={<MyMenu />}
        homeCenter={[51.251236352367464, 7.162581102842314]}
        locatorControl={true}
        gazData={gazData}
        applicationMenuTooltipString='Einstelllungen | Statistik | Anleitung'
        gazetteerSearchPlaceholder='Stadtteil | Adresse | POI'
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={400}
            config={{
              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "Zentrum",
                  plural: "Zentren",
                },
              },
              noCurrentFeatureTitle: "Keine Zentren gefunden",
              noCurrentFeatureContent: (
                <span>
                  Die Stadt Wuppertal veröffentlicht aktuell keine Corona-Präventionsorte. Bitte
                  informieren Sie sich{" "}
                  <a href='https://www.wuppertal.de/microsite/geoportal/topicmaps/topicmaps.php'>
                    hier
                  </a>{" "}
                  über unser TopicMap-Angebot.
                </span>
              ),
            }}
          />
        }
      >
        <FeatureCollection />
      </TopicMapComponent>
    </TopicMapContextProvider>
  );
}

export default App;
