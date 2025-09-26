import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";

import { useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import { genericSecondaryInfoFooterFactory } from "@carma-collab/wuppertal/commons";
import { getApplicationVersion, type VersionData } from "@carma-commons/utils";
import { InfoBox, utils } from "@carma-appframeworks/portals";

interface InfoboxProps {
  selectedFeature: any;
  versionData: VersionData;
}

export const FeatureInfobox = ({
  selectedFeature,
  versionData,
}: InfoboxProps) => {
  const [openModal, setOpenModal] = useState(false);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);
  if (!selectedFeature) {
    return null;
  }

  let links = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: !!selectedFeature?.properties?.modal,
      setVisibleStateOfSecondaryInfo: () => {
        setOpenModal(true);
      },
      displayZoomToFeature: true,
      zoomToFeature: () => {
        utils.zoomToFeature(selectedFeature, routedMapRef);
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
  // console.log("xxx selectedFeature.properties", selectedFeature);
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
