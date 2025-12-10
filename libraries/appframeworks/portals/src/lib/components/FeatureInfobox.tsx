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
  fetchRouteOptions,
  displaySelectedRouteOnMap,
  type RouteOption,
} from "@carma-appframeworks/portals";
import { RouteOptionsDrawer } from "./libremap/RouteOptionsDrawer";

interface InfoboxProps {
  selectedFeature: any;
  versionData: VersionData;
  bigMobileIconsInsteadOfCollapsing?: boolean;
  collapsible?: boolean;
  Modal?: React.ComponentType<any> | null;
  libreMap?: maplibregl.Map;
}

export const FeatureInfobox = ({
  selectedFeature,
  versionData,
  bigMobileIconsInsteadOfCollapsing = false,
  collapsible = true,
  Modal = additionalInfoFactory(
    (selectedFeature?.properties?.info || selectedFeature?.properties)?.modal
  ) as React.ComponentType<any> | null,
  libreMap,
}: InfoboxProps) => {
  const infoBoxControlObject =
    selectedFeature?.properties?.info || selectedFeature?.properties;
  const [openModal, setOpenModal] = useState(false);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  const handleRouteAction = async (routeParams: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  }) => {
    setRouteModalOpen(true);
    setRouteLoading(true);
    setRouteOptions([]);

    try {
      const options = await fetchRouteOptions(routeParams);
      setRouteOptions(options);
    } catch (error) {
      console.error("Error fetching route options:", error);
    } finally {
      setRouteLoading(false);
    }
  };

  const handleSelectRoute = (route: RouteOption) => {
    if (libreMap) {
      displaySelectedRouteOnMap({
        mapInstance: libreMap,
        route,
      });
    }
    // setRouteModalOpen(false);
  };

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
        utils.zoomToFeature({
          selectedFeature,
          leafletMap: routedMapRef?.leafletMap?.leafletElement,
          libreMap,
        });
      },
      onRouteAction: handleRouteAction,
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
      <RouteOptionsDrawer
        open={routeModalOpen}
        onClose={() => setRouteModalOpen(false)}
        onSelectRoute={handleSelectRoute}
        routes={routeOptions}
        loading={routeLoading}
        destinationName={
          infoBoxControlObject?.header || infoBoxControlObject?.title
        }
      />
    </>
  );
};
