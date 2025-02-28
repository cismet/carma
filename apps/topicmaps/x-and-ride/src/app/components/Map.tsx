import { useContext, useEffect, useState } from "react";
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
import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
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

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  useSelectionTopicMap();

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    // setTimeout(() => {
    //   const gazId = selection.more?.pid || selection.more?.kid;
    //   setSelectedFeatureByPredicate(
    //     (feature) => feature.properties.id === gazId
    //   );
    // }, 100);
  };

  return (
    <>
      <TopicMapComponent
        modalMenu={<Menu />}
        locatorControl={true}
        photoLightBox
        gazetteerSearchControl={false}
        gazetteerSearchComponent={<></>}
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

export default Map;
