import { useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { isEqual } from "lodash";
import envelope from "@turf/envelope";

import InfoBox from "react-cismap/topicmaps/InfoBox";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";

import {
  setPreferredLayerId,
  setSelectedFeature,
  updateSecondaryInfoBoxElements,
  getInfoText,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  setSecondaryInfoBoxElements,
} from "../../store/slices/features";
import { getLayers } from "../../store/slices/mapping";
import { getCoordinates } from "../GeoportalMap/topicmap.utils";
import { truncateString, updateUrlWithCoordinates } from "./featureInfoHelper";

import "../infoBox.css";

interface InfoBoxProps {
  pos?: [number, number];
}

const FeatureInfoBox = ({ pos }: InfoBoxProps) => {
  const [open, setOpen] = useState(false);
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const secondaryInfoBoxElements = useSelector(getSecondaryInfoBoxElements);
  const layers = useSelector(getLayers);
  const numOfLayers = layers.length;
  const infoText = useSelector(getInfoText);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  useEffect(() => {
    if (pos && selectedFeature && selectedFeature.id !== "information") {
      const updatedLinks = updateUrlWithCoordinates(
        selectedFeature.properties.genericLinks,
        pos
      );

      const updatedFeature = {
        ...selectedFeature,
        properties: {
          ...selectedFeature.properties,
          genericLinks: updatedLinks,
        },
      };

      if (!isEqual(selectedFeature, updatedFeature)) {
        dispatch(setSelectedFeature(updatedFeature));
      }
    }
  }, [pos, selectedFeature]);

  let links = [];
  if (selectedFeature && selectedFeature.id !== "information") {
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
                selectedFeature.properties.zoom
                  ? selectedFeature.properties.zoom
                  : 20
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

  const foto =
    "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg";
  const fotos = [
    "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg",
    "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_02.jpg",
    "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_03.jpg",
    "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_04.jpg",
    "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_05.jpg",
    "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_06.jpg",
  ];

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
          selectedFeature?.properties?.title?.includes("undefined")
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
        secondaryInfoBoxElements={
          foto
            ? [
                ...featureHeaders,
                <InfoBoxFotoPreview
                  currentFeature={selectedFeature}
                  getPhotoUrl={() => foto}
                  lightBoxDispatchContext={lightBoxDispatchContext}
                />,
              ]
            : featureHeaders
        }
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
