import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { getPoiClusterIconCreatorFunction } from "../../helper/styler";
import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";
import Menu from "./Menu";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextTitle,
  InfoBoxTextContent,
} from "@carma-collab/wuppertal/x-and-ride";
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import FuzzySearchWrapper from "./FuzzySearchWrapper";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../version.json";
import SIMComponentDictionary from "@carma-collab/wuppertal/secondary-info-modals";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { GenericInfoBoxFromFeature } from "@carma-apps/portals";

const SecondaryInfoModal = SIMComponentDictionary["xandRideSIM"];
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

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
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
            <ZoomControl />
          </Control>

          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60} title="Mein Standort">
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={false}
              nativeTooltip={true}
            />
          </Control>
          <Control position="bottomleft" order={10}>
            <div style={{ marginTop: "4px" }}>
              <FuzzySearchWrapper
                searchTextPlaceholder={searchTextPlaceholder}
              />
            </div>
          </Control>
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
                versionString={getApplicationVersion(versionData)}
              />
            )}
            <TopicMapSelectionContent />
            <FeatureCollection></FeatureCollection>
          </TopicMapComponent>
        </ControlLayout>
      </div>
    </div>
  );
};

export default Map;
