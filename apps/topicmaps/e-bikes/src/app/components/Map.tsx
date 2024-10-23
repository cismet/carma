import { useContext, useEffect, useState } from "react";

import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";

import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";

import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import { getGazData } from "../../helper/gazData";
import { getPoiClusterIconCreatorFunction } from "../../helper/styler";
import Menu from "./Menu";
import SecondaryInfoModal from "./SecondaryInfoModal";
import {
  InfoBoxTextContent,
  InfoBoxTextTitle,
  MenuTooltip,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/e-bikes";
const Map = () => {
  const [gazData, setGazData] = useState([]);
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext<typeof FeatureCollectionDispatchContext>(
    FeatureCollectionDispatchContext,
  );
  const { markerSymbolSize } = useContext<typeof TopicMapStylingContext>(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext,
  );
  const { secondaryInfoVisible } = useContext<typeof UIContext>(UIContext);
  const { setSecondaryInfoVisible } = useContext<typeof UIDispatchContext>(UIDispatchContext);
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
      gazetteerHitTrigger={(hits) => {
        if ((Array.isArray(hits) && hits[0]?.more?.pid) || hits[0]?.more?.kid) {
          const gazId = hits[0]?.more?.pid || hits[0]?.more?.kid;
          setSelectedFeatureByPredicate(
            (feature) => feature.properties.id === gazId,
          );
        }
      }}
      applicationMenuTooltipString={<MenuTooltip />}
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
      <FeatureCollection></FeatureCollection>
    </TopicMapComponent>
  );
};

export default Map;
