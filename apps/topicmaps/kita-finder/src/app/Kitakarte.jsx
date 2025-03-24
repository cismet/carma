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

const KitaKarte = () => {
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { routedMapRef } = useContext(TopicMapContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);

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
      <FuzzySearch searchTextPlaceholder={searchTextPlaceholder} />
    </>
  );
};

export default KitaKarte;
