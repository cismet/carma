import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { getPoiClusterIconCreatorFunction } from "../../helper/styler";
import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";
import Menu from "./Menu";
import SecondaryInfoModal from "./menu/SecondaryInfoModal";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextTitle,
  InfoBoxTextContent,
} from "@carma-collab/wuppertal/x-and-ride";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";
import { RoutedMapLocateControl } from "@carma-mapping/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import FuzzySearch from "./FuzzySearch";
import useLeafletZoomControls from "../../hooks/useLeafletZoomControls";

const Map = () => {
  const { setClusteringOptions } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);
  const { markerSymbolSize } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );
  const { clusteringOptions, selectedFeature } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const { secondaryInfoVisible } = useContext<typeof UIContext>(UIContext);
  const {
    setAppMenuActiveMenuSection,
    setAppMenuVisible,
    setSecondaryInfoVisible,
  } = useContext<typeof UIDispatchContext>(UIDispatchContext);

  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

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
        modalMenu={<Menu />}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        photoLightBox
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        applicationMenuTooltipString={<MenuTooltip />}
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={350}
            config={{
              displaySecondaryInfoAction: true,
              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "Anlage",
                  plural: "Anlagen",
                },
              },
              noFeatureTitle: <InfoBoxTextTitle />,
              noCurrentFeatureContent: (
                <InfoBoxTextContent
                  setAppMenuVisible={setAppMenuVisible}
                  setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
                />
              ),
            }}
          />
        }
      >
        {secondaryInfoVisible && (
          <SecondaryInfoModal
            feature={selectedFeature}
            setOpen={setSecondaryInfoVisible}
          />
        )}
        <TopicMapSelectionContent />
        <FeatureCollection></FeatureCollection>
      </TopicMapComponent>
    </>
  );
};

export default Map;
