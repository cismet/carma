import { useContext, useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import envelope from "@turf/envelope";

// import InfoBox from "react-cismap/topicmaps/InfoBox";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";

// import "../infoBox.css";
import { InfoBox } from "@carma-appframeworks/portals";
import { getCoordinates, truncateString } from "./libremap.utils";

interface InfoBoxProps {
  selectedFeature: any;
  libreMap?: maplibregl.Map | null;
}

const LibreFeatureInfoBox = ({ selectedFeature, libreMap }: InfoBoxProps) => {
  const [open, setOpen] = useState(false);

  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

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
            } else if (libreMap) {
              libreMap.flyTo({
                center: [coordinates[0], coordinates[1]],
                zoom: selectedFeature.properties.zoom
                  ? selectedFeature.properties.zoom - 1
                  : 19,
                animate: false,
              });
            }
          } else {
            const bbox = envelope(selectedFeature.geometry).bbox;

            if (routedMapRef) {
              routedMapRef.leafletMap.leafletElement.fitBounds([
                [bbox[3], bbox[2]],
                [bbox[1], bbox[0]],
              ]);
            } else if (libreMap) {
              libreMap.fitBounds(
                [
                  [bbox[0], bbox[1]],
                  [bbox[2], bbox[3]],
                ],
                {
                  padding: 60,
                }
              );
            }
          }
        }
      },
    });
  }

  if (!selectedFeature?.properties) {
    return null;
  }

  //   const Modal = additionalInfoFactory(selectedFeature?.properties?.modal);

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
        noCurrentFeatureTitle={""}
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
          selectedFeature.properties.foto || selectedFeature.properties.fotos
            ? [
                <InfoBoxFotoPreview
                  currentFeature={selectedFeature}
                  lightBoxDispatchContext={lightBoxDispatchContext}
                />,
              ]
            : []
        }
        links={links}
      />
      {/* {open && (
        <Modal
          setOpen={() => setOpen(false)}
          feature={{
            properties: selectedFeature.properties.wmsProps,
          }}
        />
      )} */}
    </>
  );
};

export default LibreFeatureInfoBox;
