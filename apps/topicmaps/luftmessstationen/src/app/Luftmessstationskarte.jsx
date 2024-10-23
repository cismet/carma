import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import React, { useContext, useEffect, useState } from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import ContactButton from "react-cismap/ContactButton";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import "react-cismap/topicMaps.css";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import "./App.css";
import { getStatus } from "./helper/convertItemToFeature";
import { getGazData } from "./helper/getGazData";
import MyMenu from "./Menu";
import InfoPanel from "./SecondaryInfo";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextContent,
} from "@carma-collab/wuppertal/luftmessstationen";

function Comp() {
  const [gazData, setGazData] = useState([]);
  const { setSelectedFeatureByPredicate } = useContext(
    FeatureCollectionDispatchContext,
  );
  // const { items, filteredItems, allFeatures } = useContext(FeatureCollectionContext);

  // console.log("allFeatures", allFeatures);

  useEffect(() => {
    getGazData(setGazData);
    document.title = "Luftmessstationskarte Wuppertal";
  }, []);

  return (
    <TopicMapComponent
      locatorControl={true}
      gazData={gazData}
      modalMenu={<MyMenu />}
      applicationMenuTooltipString={<MenuTooltip />}
      gazetteerSearchPlaceholder={searchTextPlaceholder}
      infoBox={
        <GenericInfoBoxFromFeature
          pixelwidth={350}
          config={{
            displaySecondaryInfoAction: true,

            city: "Wuppertal",
            navigator: {
              noun: {
                singular: "Messstation",
                plural: "Messstationen",
              },
            },
            noCurrentFeatureTitle: "Keine Messtationen gefunden",
            noCurrentFeatureContent: <InfoBoxTextContent />,
          }}
        />
      }
      secondaryInfo={<InfoPanel />}
      gazetteerHitTrigger={(hits) => {
        if (Array.isArray(hits) && hits[0]?.more?.mid) {
          setSelectedFeatureByPredicate(
            (feature) => feature.properties.id === hits[0].more.mid,
          );
        }
      }}
    >
      <ContactButton
        title="Rückfrage zu den Messwerten"
        action={() => {
          let link = document.createElement("a");
          link.setAttribute("type", "hidden");
          const br = "\n";

          let mailToHref =
            "mailto:luftreinhaltung@stadt.wuppertal.de?subject=Rückfrage zu Messwerten&body=" +
            encodeURI(
              `Sehr geehrte Damen und Herren,${br}${br} zu der Luftmessstationskarte `,
            ) +
            encodeURI(`auf${br}${br}`) +
            `${window.location.href
              .replace(/&/g, "%26")
              .replace(/#/g, "%23")}` +
            encodeURI(
              `${br}` +
                `${br}` +
                `habe ich folgende Frage:${br}` +
                `${br}${br}${br}${br}` +
                `Mit freundlichen Grüßen${br}` +
                `${br}` +
                `${br}`,
            );
          document.body.appendChild(link);
          link.href = mailToHref;
          link.click();
        }}
      />
      <FeatureCollection></FeatureCollection>
      {/* <LogSelection /> */}
    </TopicMapComponent>
  );
}

export default Comp;
