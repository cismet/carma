import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { getGazData } from "../../helper/gazData";
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
const Map = () => {
  const [gazData, setGazData] = useState([]);
  const { setClusteringOptions } = useContext<
    typeof FeatureCollectionDispatchContext
  >(FeatureCollectionDispatchContext);
  const { markerSymbolSize } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext,
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
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

  return (
    <TopicMapComponent
      gazData={gazData}
      modalMenu={<Menu />}
      locatorControl={true}
      photoLightBox
      gazetteerSearchPlaceholder={searchTextPlaceholder}
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
      <FeatureCollection></FeatureCollection>
    </TopicMapComponent>
  );
};

export default Map;
