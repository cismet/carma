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

import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

function Comp() {
  const { setSelectedFeatureByPredicate } = useContext(
    FeatureCollectionDispatchContext
  );

  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;

  useEffect(() => {
    document.title = "Luftmessstationskarte Wuppertal";
  }, []);

  const { gazData } = useGazData();
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
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    setTimeout(() => {
      const gazId = selection.more?.mid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, 100);
  };

  return (
    <>
      <TopicMapComponent
        locatorControl={true}
        modalMenu={<MyMenu />}
        applicationMenuTooltipString={<MenuTooltip />}
        gazetteerSearchComponent={EmptySearchComponent}
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
                `Sehr geehrte Damen und Herren,${br}${br} zu der Luftmessstationskarte `
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
                  `${br}`
              );
            document.body.appendChild(link);
            link.href = mailToHref;
            link.click();
          }}
        />
        <TopicMapSelectionContent />

        <FeatureCollection></FeatureCollection>
        {/* <LogSelection /> */}
      </TopicMapComponent>
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          placeholder={searchTextPlaceholder}
          pixelwidth={pixelwidth}
        />
      </div>
    </>
  );
}

export default Comp;
