import InfoBox from "react-cismap/topicmaps/InfoBox";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";

import envelope from "@turf/envelope";

import { ComponentType, useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import { genericSecondaryInfoFooterFactory } from "@carma-collab/wuppertal/commons";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

interface InfoboxProps {
  selectedFeature: any;
}

const FeatureInfobox = ({ selectedFeature }: InfoboxProps) => {
  const [openModal, setOpenModal] = useState(false);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  if (!selectedFeature) {
    return null;
  }

  const getCoordinates = (geometry) => {
    switch (geometry.type) {
      case "Polygon":
        return geometry.coordinates[0][0];
      case "MultiPolygon":
        return geometry.coordinates[0][0][0];
      case "LineString":
        return geometry.coordinates[1];
      default:
        return geometry.coordinates;
    }
  };

  let links = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: !!selectedFeature?.properties?.modal,
      setVisibleStateOfSecondaryInfo: () => {
        setOpenModal(true);
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

  const truncateString = (text: string, num: number) => {
    if (text.length > num) {
      return text.slice(0, num) + "...";
    }
    return text;
  };

  const Modal = additionalInfoFactory(
    selectedFeature?.properties?.modal
  ) as React.ComponentType<any> | null;

  return (
    <>
      {" "}
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
          "Auf die Karte klicken um Informationen abzurufen"
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
          selectedFeature?.properties.foto || selectedFeature?.properties.fotos
            ? [
                <InfoBoxFotoPreview
                  key="infobox-foto-preview"
                  currentFeature={selectedFeature}
                  lightBoxDispatchContext={lightBoxDispatchContext}
                />,
              ]
            : []
        }
        links={links}
      />
      {openModal && Modal && (
        <Modal
          setOpen={() => setOpenModal(false)}
          feature={{
            properties: selectedFeature.properties.wmsProps,
          }}
          versionString={getApplicationVersion(versionData)}
          Footer={genericSecondaryInfoFooterFactory()}
        />
      )}
    </>
  );
};

export default FeatureInfobox;
