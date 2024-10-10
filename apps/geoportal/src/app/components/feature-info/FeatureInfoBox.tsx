import { useContext, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import InfoBox from "react-cismap/topicmaps/InfoBox";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";

import {
  getInfoText,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  setPreferredLayerId,
  setSelectedFeature,
  updateSecondaryInfoBoxElements,
} from "../../store/slices/features";
import { getLayers } from "../../store/slices/mapping";
import { truncateString } from "./featureInfoHelper";

import "../infoBox.css";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { getCoordinates } from "../GeoportalMap/topicmap.utils";
import envelope from "@turf/envelope";

const FeatureInfoBox = () => {
  const [open, setOpen] = useState(false);
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const secondaryInfoBoxElements = useSelector(getSecondaryInfoBoxElements);
  const numOfLayers = useSelector(getLayers).length;
  const infoText = useSelector(getInfoText);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  let links = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: !!selectedFeature?.properties?.modal,
      setVisibleStateOfSecondaryInfo: () => {
        setOpen(true);
      },
      displayZoomToFeature: true,
      zoomToFeature: () => {
        if (selectedFeature.geometry) {
          const type = selectedFeature.geometry.type;
          if (type === "Point") {
            const coordinates = getCoordinates(selectedFeature.geometry);

            if (routedMapRef) {
              routedMapRef.leafletMap.leafletElement.setView(
                [coordinates[1], coordinates[0]],
                20,
              );
            }
          } else {
            const bbox = envelope(selectedFeature.geometry).bbox;

            if (routedMapRef) {
              routedMapRef.leafletMap.leafletElement.fitBounds([
                [bbox[3], bbox[2]],
                [bbox[1], bbox[0]],
              ]);
            }
          }
        }
      },
    });
  }

  const featureHeaders = secondaryInfoBoxElements.map((feature, i) => {
    return (
      <div
        style={{
          width: "340px",
          paddingBottom: 3,
          paddingLeft: 10 + i * 10,
          cursor: "pointer",
        }}
        key={"overlapping."}
        onClick={() => {
          dispatch(setSelectedFeature(feature));
          dispatch(updateSecondaryInfoBoxElements(feature));
          dispatch(setPreferredLayerId(feature.id));
        }}
      >
        <InfoBoxHeader
          content={feature.properties.header}
          headerColor={"grey"}
        ></InfoBoxHeader>
      </div>
    );
  });

  const Modal = additionalInfoFactory(selectedFeature?.properties?.modal);

  return (
    <>
      <InfoBox
        pixelwidth={350}
        currentFeature={selectedFeature}
        hideNavigator={true}
        {...selectedFeature?.properties}
        headerColor={
          selectedFeature?.properties.headerColor
            ? selectedFeature.properties.headerColor
            : "#0078a8"
        }
        title={
          selectedFeature?.properties?.title.includes("undefined")
            ? undefined
            : selectedFeature?.properties?.title
        }
        noCurrentFeatureTitle={
          infoText
            ? infoText
            : numOfLayers > 0
            ? "Auf die Karte klicken um Informationen abzurufen"
            : "Layer hinzufügen um Informationen abrufen zu können"
        }
        header={
          <div
            className="w-full"
            style={{
              backgroundColor: selectedFeature?.properties.headerColor
                ? selectedFeature.properties.headerColor
                : "#0078a8",
            }}
          >
            {selectedFeature?.properties.header
              ? truncateString(selectedFeature.properties.header, 66)
              : "Informationen"}
          </div>
        }
        noCurrentFeatureContent=""
        secondaryInfoBoxElements={featureHeaders}
        links={links}
      />
      {open && (
        <Modal
          setOpen={() => setOpen(false)}
          feature={{
            properties: selectedFeature.properties.wmsProps,
          }}
        />
      )}
    </>
  );
};

export default FeatureInfoBox;
