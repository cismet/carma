import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import { useContext, useEffect, useState } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import FeatureCollection from "react-cismap/FeatureCollection";
import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";
import "react-cismap/topicMaps.css";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import "./App.css";
import MyMenu, { getFilterInfo } from "./Menu";
import InfoPanel from "./SecondaryInfo";

import { dataHost } from "./App";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import {
  TopicMapContext,
  TopicMapDispatchContext,
} from "react-cismap/contexts/TopicMapContextProvider";
import { removeQueryPart } from "react-cismap/tools/routingHelper";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
const getGazData = async (setGazData) => {
  const prefix = "GazDataForStories";
  const sources = {};

  sources.adressen = await md5FetchText(prefix, dataHost + "/data/adressen.json");
  sources.bezirke = await md5FetchText(prefix, dataHost + "/data/bezirke.json");
  sources.quartiere = await md5FetchText(prefix, dataHost + "/data/quartiere.json");
  sources.bpklimastandorte = await md5FetchText(prefix, dataHost + "/data/bpklimastandorte.json");

  const gazData = getGazDataForTopicIds(sources, [
    "bpklimastandorte",
    "bezirke",
    "quartiere",
    "adressen",
  ]);

  setGazData(gazData);
};

function KlimaorteMap() {
  const { setSelectedFeatureByPredicate, setFilterState } = useContext(
    FeatureCollectionDispatchContext
  );
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);
  const { selectedFeature, items, shownFeatures, filterState } =
    useContext(FeatureCollectionContext);
  const { zoomToFeature } = useContext(TopicMapDispatchContext);
  const { history } = useContext(TopicMapContext);

  const [gazData, setGazData] = useState([]);
  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    const handleShow = (search) => {
      //check whether shownFeatures is undefined
      //then the map is not ready wait for it
      if (shownFeatures === undefined || items === undefined) {
        return;
      }

      const show = new URLSearchParams(search).get("show");
      const foundShow = show != null;
      if (foundShow === true) {
        //check whether the feature is already shown
        const foundFeature = shownFeatures.find((f) => f.properties.standort.id === parseInt(show));
        if (foundFeature !== undefined) {
          setSelectedFeatureByPredicate((feature) => {
            try {
              return parseInt(feature.properties.standort.id) === parseInt(show);
            } catch (e) {
              return false;
            }
          });
          history.push(removeQueryPart(search, "show"));
        } else {
          //check whether the feature is in the items list
          const foundFeature = items.find((i) => i.standort.id === parseInt(show));
          if (foundFeature !== undefined) {
            const { themen } = getFilterInfo(items);
            setFilterState({ ...filterState, themen });
            // reset the filter
          } else {
            console.log("Objekt mit Standort.ID=" + show + " nicht gefunden");
            history.push(removeQueryPart(search, "show"));
          }
        }

        // setFilterState({ kampagnen: [] });
        // setAppMenuVisible(true);
        // setTimeout(() => {
        //   setAppMenuActiveMenuSection("filter");
        // }, 50);
      }
    };

    handleShow(history.location.search);
    return history.listen(() => {
      handleShow(history.location.search);
    });
  }, [history, shownFeatures, items]);

  let weitereAngebote;
  const angebot = selectedFeature?.properties;
  let moreDataAvailable = false;
  if (angebot) {
    weitereAngebote = items.filter(
      (testItem) => testItem?.standort.id === angebot.standort.id && testItem.id !== angebot.id
    );
    moreDataAvailable =
      weitereAngebote.length > 0 ||
      selectedFeature?.properties?.bemerkung !== undefined ||
      selectedFeature?.properties?.kommentar !== undefined;
  }

  const linkProduction = new URLSearchParams(history.location.search).get("linkProduction");
  const linkProductionEnabled = linkProduction != null;

  let secondaryInfoBoxElements = [
    <InfoBoxFotoPreview
      lightBoxDispatchContext={lightBoxDispatchContext}
      currentFeature={selectedFeature}
    />,
  ];

  if (linkProductionEnabled) {
    secondaryInfoBoxElements.push(
      <a
        href={window.location.href + "&show=" + selectedFeature?.properties?.standort?.id}
        target='_blank'
        rel='noreferrer'
      >
        π
      </a>
    );
  }

  return (
    <TopicMapComponent
      applicationMenuTooltipString='Filter | Einstellungen | Anleitung'
      locatorControl={true}
      modalMenu={<MyMenu />}
      gazData={gazData}
      gazetteerSearchPlaceholder='Klimaort | Stadtteil | Adresse'
      infoBox={
        <GenericInfoBoxFromFeature
          pixelwidth={400}
          config={{
            displaySecondaryInfoAction: moreDataAvailable,
            city: "Wuppertal",
            navigator: {
              noun: {
                singular: "Klimaort",
                plural: "Klimaorte",
              },
            },
            noCurrentFeatureTitle: "Keine Klimaorte gefunden",
            noCurrentFeatureContent: "",
          }}
          secondaryInfoBoxElements={secondaryInfoBoxElements}
        />
      }
      secondaryInfo={<InfoPanel />}
      gazetteerHitTrigger={(hits) => {
        if (Array.isArray(hits) && hits[0]?.more?.id) {
          setSelectedFeatureByPredicate((feature) => {
            try {
              const check = parseInt(feature.properties.standort.id) === hits[0].more.id;
              if (check === true) {
                zoomToFeature(feature);
              }
              return check;
            } catch (e) {
              return false;
            }
          });
        }
      }}
    >
      <FeatureCollection />
    </TopicMapComponent>
  );
}

export default KlimaorteMap;
