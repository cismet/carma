import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { getGazData } from "./helper/helper";
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

import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
const KitaKarte = () => {
  // const [gazData, setGazData] = useState([]);
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { routedMapRef } = useContext(TopicMapContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);

  const { additionalStylingInfo } = useContext(TopicMapStylingContext);

  // useEffect(() => {
  //   getGazData(setGazData);
  // }, []);

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

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    setTimeout(() => {
      const gazId = selection.more?.pid || selection.more?.kid;
      setSelectedFeatureByPredicate(
        (feature) => feature.properties.id === gazId
      );
    }, 100);
  };

  return (
    <>
      <TopicMapComponent
        // gazData={gazData}
        modalMenu={
          <Menu previewFeatureCollectionProps={featureCollectionProps} />
        }
        locatorControl={true}
        // gazetteerSearchPlaceholder={searchTextPlaceholder}
        // gazetteerHitTrigger={(hits) => {
        //   if ((Array.isArray(hits) && hits[0]?.more?.pid) || hits[0]?.more?.kid) {
        //     const gazId = hits[0]?.more?.pid || hits[0]?.more?.kid;
        //     setSelectedFeatureByPredicate(
        //       (feature) => feature.properties.id === gazId
        //     );
        //   }
        // }}
        gazetteerSearchControl={false}
        gazetteerSearchComponent={<></>}
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
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          placeholder={searchTextPlaceholder}
        />
      </div>
    </>
  );
};

export default KitaKarte;
