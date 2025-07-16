import { useContext } from "react";
// import {
//   FeatureCollectionContext,
//   FeatureCollectionDispatchContext,
// } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
// import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
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
// import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";

// import GenericInfoBoxFromFeature from "./components/GenericInfoBoxFromFeature";
import { GenericInfoBoxFromFeature } from "@carma-apps/portals";

const KitaKarte = () => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  useSelectionTopicMap();

  // const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
  //   FeatureCollectionDispatchContext
  // );
  // const { routedMapRef } = useContext(TopicMapContext);
  // const { clusteringOptions } = useContext(FeatureCollectionContext);

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
          <div style={{ marginTop: "4px", marginLeft: "3px" }}>
            <LibFuzzySearch
              pixelwidth={
                responsiveState === "normal" ? "300px" : windowSize.width - gap
              }
              placeholder={searchTextPlaceholder}
            />
          </div>
        </Control>
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
              infoStyle={{ marginLeft: "3px" }}
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
      </ControlLayout>
    </div>
  );
};

export default KitaKarte;
