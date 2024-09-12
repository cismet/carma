import { faSearch, faSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import bboxPolygon from "@turf/bbox-polygon";
import turfCenter from "@turf/center";
import "bootstrap/dist/css/bootstrap.min.css";
import Color from "color";
import "leaflet/dist/leaflet.css";
import { useContext, useEffect, useState } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { FeatureCollectionDisplay } from "react-cismap";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";
import "react-cismap/topicMaps.css";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { TransitiveReactLeafletControl as Control } from "react-cismap";
import { daqKeys, db } from "./App";
import "./App.css";
import InfoBox, { modes } from "./components/InfoBox";
import MyMenu from "./components/Menu";
import InfoPanel from "./components/SecondaryInfo";
import Crosshair from "./Crosshair";
import { searchForFeatures } from "./search";

const host = "https://wupp-topicmaps-data.cismet.de";

const getData = async (setGazData) => {
  const prefix = "GazDataForStories";
  const sources = {};

  //  sources.stoerfallbetrieb = await md5ActionFetchDAQ4Dexie(prefix, 'url', 'xxx', 'daqStoerfallBetriebeKlasse1');
  sources.adressen = await md5FetchText(
    prefix,
    host + "/data/3857/adressen.json",
  );
  sources.bezirke = await md5FetchText(
    prefix,
    host + "/data/3857/bezirke.json",
  );
  sources.quartiere = await md5FetchText(
    prefix,
    host + "/data/3857/quartiere.json",
  );
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

const convertToFeature = (_item) => {
  const item = JSON.parse(JSON.stringify(_item));

  const geometry = item?.geojson;
  const selected = false;
  const type = "Feature";
  let text = item?.bezeichnung;
  switch (item.typ) {
    case "naturschutzgebiete":
      text = item?.nrw_name;
      item.color = "#649351";
      break;
    case "landschaftsschutzgebiete":
      text = "Landschaftsschutzgebiet";
      item.color = "#97C146";

      break;
    case "stadtFlurstuecke":
      text = item?.flurstueck;
      item.color = "#dddddd";
      item.opcaity = 0.3;
      break;
    case "trinkwasserbrunnen":
      text = item?.str_name + " " + item?.hsnr;
      item.color = "#A7DBD8";
      item.opcaity = 0.3;

      break;
    case "bimschWuppertal":
      text = item?.b_firma1;
      item.color = "#774F38";

      break;
    case "bimschNrw":
      text = item?.b_firma1;

      item.color = "#774F38";

      break;
    case "wasserschutzgebiete":
      text = item?.zone;
      if (item?.zone === "I") {
        item.color = "#F4C900";
      } else if (item?.zone === "II") {
        item.color = "#FAE842";
      } else if (item?.zone === "III") {
        item.color = "#FFFF99";
      } else {
        item.color = "#69D2E7";
      }

      break;
    case "StoerfallBetriebeKlasse1":
      text = item?.betrieb;
      item.color = "#DD4A36";
      break;
    case "StoerfallBetriebeKlasse2":
      text = item?.betrieb;
      item.color = "#DD4A36";
      item.opacity = 0.3;

      break;

    default:
      return undefined;
  }

  return {
    id: item.typ + "." + item.id,
    text,
    type,
    selected,
    geometry,
    crs: geometry?.crs || {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::25832",
      },
    },
    properties: item,
  };
};

const style = (feature) => {
  let color = new Color(feature?.properties?.color || "#ff0000");
  let linecolor = new Color(feature?.properties?.color || "#ff0000").darken(
    0.5,
  );

  return {
    fillColor: color,
    color: linecolor,
    opacity: 0.5,
    fillOpacity: feature?.properties?.opacity || 0.6,

    weight: 0.5,
  };
};

function UmweltalarmMap({ loggedOut, initialised }) {
  const { routedMapRef } = useContext(TopicMapContext);
  const mapRef = routedMapRef?.leafletMap?.leafletElement;
  const currentZoom = mapRef?.getZoom();
  const [gazData, setGazData] = useState([]);
  const [isFeatureCollectionVisible, setFeatureCollectionVisible] =
    useState(false);

  const [hits, setHits] = useState([]);
  const [searchMode, setSearchMode] = useState(modes.CENTER);
  const [featureCollection, setFeatureCollection] = useState([]);
  const [bbPoly, setBBPoly] = useState();
  const { windowSize } = useContext(ResponsiveTopicMapContext);

  useEffect(() => {
    getData(setGazData);
  }, []);

  useEffect(() => {
    const features = [];
    for (const hit of hits || []) {
      const f = convertToFeature(hit);
      if (f) {
        features.push(f);
      }
    }
    setFeatureCollection(features);
  }, [hits]);

  const searchInWholeWindowEnabled = currentZoom && currentZoom >= 16;
  return (
    <div key={initialised != null ? initialised : "init"}>
      <Crosshair />
      <TopicMapComponent
        gazData={gazData}
        modalMenu={<MyMenu />}
        homeZoom={13}
        maxZoom={22}
        applicationMenuTooltipString="Einstellungen | Legende | Kompaktanleitung"
        secondaryInfo={windowSize && <InfoPanel hits={hits} />}
        locatorControl={true}
        mappingBoundsChanged={(boundingBox) => {
          setHits(undefined);
          let bbox = [
            boundingBox.left,
            boundingBox.bottom,
            boundingBox.right,
            boundingBox.top,
          ];
          let bbPoly = bboxPolygon(bbox);

          //   console.log("xxx mappingBoundsChanged", center);
          let center = turfCenter(bbPoly);

          searchForFeatures(db, daqKeys, center).then((hits) => {
            setSearchMode(modes.CENTER);
            setHits(hits);
            setBBPoly(bbPoly);
          });
        }}
      >
        {!loggedOut && (
          <InfoBox
            mode={searchMode}
            isFeatureCollectionVisible={isFeatureCollectionVisible}
            setFeatureCollectionVisible={setFeatureCollectionVisible}
            hits={hits}
          />
        )}
        {isFeatureCollectionVisible && (
          <FeatureCollectionDisplay
            style={style}
            featureCollection={featureCollection}
          />
        )}

        <Control className="leaflet-bar" position={"topleft"}>
          <button
            title="Objekte im Kartenfenster suchen"
            disabled={!searchInWholeWindowEnabled}
            onClick={() => {
              setHits();

              searchForFeatures(db, daqKeys, bbPoly).then((hits) => {
                setSearchMode(modes.WINDOW);

                setHits(hits);
              });
            }}
            className="easy-button-button leaflet-bar-part leaflet-interactive unnamed-state-active"
          >
            <span
              style={{
                color: searchInWholeWindowEnabled ? "#444444" : "#bbbbbb",
              }}
              className="fa-layers fa-fw "
            >
              <FontAwesomeIcon transform="grow-9" icon={faSearch} size="lg" />
              <FontAwesomeIcon
                transform="shrink-8 up-2 left-2.3"
                icon={faSquare}
                size="lg"
              />
            </span>
          </button>
        </Control>
      </TopicMapComponent>
    </div>
  );
}

export default UmweltalarmMap;
