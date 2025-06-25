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
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
// import { getPoiClusterIconCreatorFunction } from "../../helper/styler";
import Menu from "./Menu";
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
  defaultTypeInference,
} from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { GenericInfoBoxFromFeature } from "@carma-apps/portals";
import SecondaryInfoModal from "./SecondaryInfoModal";

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
  const { setSecondaryInfoVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  useSelectionTopicMap();

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        // iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
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
          <div data-test-id="fuzzy-search" style={{ marginTop: "4px" }}>
            <LibFuzzySearch
              typeInference={defaultTypeInference}
              // onSelection={()=> {}}
              pixelwidth={
                responsiveState === "normal" ? "300px" : windowSize.width - gap
              }
            />
          </div>
        </Control>
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
                    singular: "Item",
                    plural: "Items",
                  },
                },
                noCurrentFeatureTitle: "Keine Data gefunden",
                noCurrentFeatureContent: (
                  <span>
                    Für mehr Bäder Ansicht mit verkleinern oder mit dem
                    untenstehenden Link auf das komplette Stadtgebiet zoomen.
                  </span>
                ),
              }}
            />
          }
        >
          {secondaryInfoVisible && (
            <SecondaryInfoModal
              // versionString={getApplicationVersion(versionData)}
              feature={selectedFeature}
              setOpen={setSecondaryInfoVisible}
            />
          )}
          <TopicMapSelectionContent />
          <FeatureCollection></FeatureCollection>
        </TopicMapComponent>
      </ControlLayout>
    </div>
  );
};

export default Map;
