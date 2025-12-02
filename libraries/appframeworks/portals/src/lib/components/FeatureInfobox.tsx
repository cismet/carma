import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

import { useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import { genericSecondaryInfoFooterFactory } from "@carma-collab/wuppertal/commons";
import {
  getApplicationVersion,
  updateUrl,
  type VersionData,
} from "@carma-commons/utils";
import {
  InfoBox,
  utils,
  getActionLinksForFeature,
} from "@carma-appframeworks/portals";

interface InfoboxProps {
  selectedFeature: any;
  versionData: VersionData;
  bigMobileIconsInsteadOfCollapsing?: boolean;
  collapsible?: boolean;
  Modal?: React.ComponentType<any> | null;
}

export const FeatureInfobox = ({
  selectedFeature,
  versionData,
  bigMobileIconsInsteadOfCollapsing = false,
  collapsible = true,
  Modal = additionalInfoFactory(
    (selectedFeature?.properties?.info || selectedFeature?.properties)?.modal
  ) as React.ComponentType<any> | null,
}: InfoboxProps) => {
  const infoBoxControlObject =
    selectedFeature?.properties?.info || selectedFeature?.properties;
  const [openModal, setOpenModal] = useState(false);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);
  if (!selectedFeature) {
    return null;
  }

  let links: JSX.Element[] = [];
  if (selectedFeature) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: !!infoBoxControlObject?.modal,
      setVisibleStateOfSecondaryInfo: () => {
        setOpenModal(true);
      },
      displayZoomToFeature: true,
      zoomToFeature: () => {
        utils.zoomToFeature(
          selectedFeature,
          routedMapRef.leafletMap.leafletElement
        );
      },
    });
  }

  const truncateString = (text: string, num: number) => {
    if (text.length > num) {
      return text.slice(0, num) + "...";
    }
    return text;
  };

  return (
    <>
      {" "}
      <InfoBox
        pixelwidth={350}
        currentFeature={selectedFeature}
        hideNavigator={true}
        {...infoBoxControlObject}
        headerColor={
          infoBoxControlObject.headerColor
            ? infoBoxControlObject.headerColor
            : "#0078a8"
        }
        title={
          infoBoxControlObject?.title?.includes("undefined")
            ? undefined
            : infoBoxControlObject?.title
        }
        noCurrentFeatureTitle={
          "Auf die Karte klicken um Informationen abzurufen"
        }
        header={
          <div
            className="w-full"
            style={{
              backgroundColor: infoBoxControlObject.headerColor
                ? selectedFeature.properties.headerColor
                : "#0078a8",
            }}
          >
            {infoBoxControlObject.header
              ? truncateString(infoBoxControlObject.header, 66)
              : "Informationen"}
          </div>
        }
        noCurrentFeatureContent=""
        secondaryInfoBoxElements={
          infoBoxControlObject.foto || infoBoxControlObject.fotos
            ? [
                <InfoBoxFotoPreview
                  key="infobox-foto-preview"
                  currentFeature={selectedFeature}
                  getPhotoUrl={(feature) =>
                    feature?.properties?.info?.foto || feature?.properties?.foto
                  }
                  getPhotoSeriesArray={(feature) =>
                    feature?.properties?.info?.fotos ||
                    feature?.properties?.fotos
                  }
                  lightBoxDispatchContext={lightBoxDispatchContext}
                  urlManipulation={updateUrl}
                />,
              ]
            : []
        }
        links={links}
        bigMobileIconsInsteadOfCollapsing={bigMobileIconsInsteadOfCollapsing}
        collapsible={collapsible}
      />
      {openModal && Modal && (
        <Modal
          setOpen={() => setOpenModal(false)}
          feature={{
            properties:
              selectedFeature.properties.wmsProps || selectedFeature.properties,
          }}
          versionString={getApplicationVersion(versionData)}
          Footer={genericSecondaryInfoFooterFactory()}
        />
      )}
    </>
  );
};
