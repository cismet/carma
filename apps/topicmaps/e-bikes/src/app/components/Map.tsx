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
import { TopicMapSelectionContent } from "@carma-apps/portals";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";

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
  const { setSecondaryInfoVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

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
      <TopicMapComponent
        modalMenu={<Menu />}
        locatorControl={true}
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
