import { useContext } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextContent,
  InfoBoxTextTitle,
} from "@carma-collab/wuppertal/kita-finder";
import {
  getClusterIconCreatorFunction,
  getColorForProperties,
  getFeatureStyler,
} from "./helper/styler";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import FuzzySearch from "./components/FuzzySearch";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import useLeafletZoomControls from "../hooks/useLeafletZoomControls";
import { RoutedMapLocateControl } from "@carma-mapping/components";

const KitaKarte = () => {
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { routedMapRef } = useContext(TopicMapContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  const { additionalStylingInfo } = useContext(TopicMapStylingContext);

  // useEffect(() => {
  //   if (additionalStylingInfo) {
  //     console.log("changeClusteringOptions", additionalStylingInfo);

  //     setClusteringOptions({
  //       ...clusteringOptions,
  //       iconCreateFunction: getClusterIconCreatorFunction({
  //         featureRenderingOption: additionalStylingInfo.featureRenderingOption,
  //       }),
  //     });

  //   }
  // }, [additionalStylingInfo]);

  const featureCollectionProps = {
    clusteringOptions: {
      iconCreateFunction: getClusterIconCreatorFunction({
        svgSize: 35,
        featureRenderingOption: additionalStylingInfo.featureRenderingOption,
      }),
    },
    styler: (
      svgSize,
      colorizer = getColorForProperties,
      appMode,
      secondarySelection,
      _additionalStylingInfoWillBeOverridden
    ) =>
      getFeatureStyler(
        svgSize,
        (colorizer = getColorForProperties),
        appMode,
        secondarySelection,
        {
          featureRenderingOption: additionalStylingInfo.featureRenderingOption,
        }
      ),
  };

  return (
    <>
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <div className="flex flex-col">
              <ControlButtonStyler
                onClick={zoomInLeaflet}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
                title="Vergrößern"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
              <ControlButtonStyler
                onClick={zoomOutLeaflet}
                className="!rounded-t-none !border-t-[1px]"
                dataTestId="zoom-out-control"
                title="Verkleinern"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
            </div>
          </Control>

          <Control position="topleft" order={50}>
            <ControlButtonStyler
              title={
                document.fullscreenElement
                  ? "Vollbildmodus beenden"
                  : "Vollbildmodus"
              }
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              dataTestId="full-screen-control"
            >
              <FontAwesomeIcon
                icon={document.fullscreenElement ? faCompress : faExpand}
              />
            </ControlButtonStyler>
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          <Control position="bottomleft" order={10}>
            <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
              <FuzzySearch searchTextPlaceholder={searchTextPlaceholder} />
            </div>
          </Control>
        </ControlLayout>
      </div>
      <TopicMapComponent
        modalMenu={
          <Menu previewFeatureCollectionProps={featureCollectionProps} />
        }
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        applicationMenuTooltipString={<MenuTooltip />}
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={350}
            headerColorizer={(feature, featureRenderingOption) => {
              return getColorForProperties(
                feature?.properties,
                featureRenderingOption
              );
            }}
            config={{
              displaySecondaryInfoAction: false,
              city: "Wuppertal",
              header: "Kita",
              navigator: {
                noun: {
                  singular: "Kita",
                  plural: "Kitas",
                },
              },
              noFeatureTitle: <InfoBoxTextTitle />,
              noCurrentFeatureContent: <InfoBoxTextContent />,
            }}
          />
        }
      >
        <TopicMapSelectionContent />
        <FeatureCollection
          key={`feature_${additionalStylingInfo.featureRenderingOption}`}
          {...featureCollectionProps}
        ></FeatureCollection>
      </TopicMapComponent>
    </>
  );
};

export default KitaKarte;
