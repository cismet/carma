import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { getPoiClusterIconCreatorFunction } from "../../helper/styler";
import Menu from "./Menu";
import SecondaryInfoModal from "./SecondaryInfoModal";
import {
  InfoBoxTextContent,
  InfoBoxTextTitle,
  MenuTooltip,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/e-bikes";
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
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
import useLeafletZoomControls from "../../hooks/useLeafletZoomControls";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

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
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  useSelectionTopicMap();
  const { setSecondaryInfoVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
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
              <LibFuzzySearch
                priorityTypes={[
                  "ebikes",
                  "bezirke",
                  "quartiere",
                  "adressen",
                  "streets",
                  "pois",
                  "poisAlternativeNames",
                  "kitas",
                  "schulen",
                ]}
                typeInference={{
                  adressen: (item) => {
                    if (item.glyph === "home") {
                      return "adressen";
                    } else if (item.glyph === "road") {
                      return "streets";
                    } else {
                      return "adressen";
                    }
                  },

                  pois: (item) => {
                    if (item.glyph === "tag") {
                      return "pois";
                    } else if (item.glyph === "tags") {
                      return "poisAlternativeNames";
                    } else if (item.glyph === "graduation-cap") {
                      return "schulen";
                    } else {
                      return "pois";
                    }
                  },
                }}
                // onSelection={()=> {}}
                pixelwidth={
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
                }
                placeholder={searchTextPlaceholder}
              />
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
        applicationMenuTooltipString={<MenuTooltip />}
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={350}
            config={{
              displaySecondaryInfoAction: true,
              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "Sation",
                  plural: "Stationen",
                },
              },
              noFeatureTitle: <InfoBoxTextTitle />,
              noCurrentFeatureContent: <InfoBoxTextContent />,
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
