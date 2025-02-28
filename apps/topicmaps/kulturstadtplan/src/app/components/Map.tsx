import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import {
  getAllEinrichtungen,
  getPoiClusterIconCreatorFunction,
} from "../../helper/styler";
import Menu from "./Menu";
import Icon from "react-cismap/commons/Icon";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import {
  searchTextPlaceholder,
  MenuTooltip,
  InfoBoxTextContent,
  InfoBoxTextTitle,
} from "@carma-collab/wuppertal/kulturstadtplan";
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
  const {
    setSelectedFeatureByPredicate,
    setClusteringOptions,
    setFilterState,
  } = useContext<typeof FeatureCollectionDispatchContext>(
    FeatureCollectionDispatchContext
  );
  const { markerSymbolSize } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );
  const { clusteringOptions, itemsDictionary } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const { setAppMenuActiveMenuSection, setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

  useEffect(() => {
    const einrichtungen = getAllEinrichtungen().map(
      (einrichtung) => einrichtung
    );
    const veranstaltungen = itemsDictionary?.veranstaltungsarten?.map(
      (veranstaltung) => veranstaltung
    );
    setFilterState({
      einrichtung: einrichtungen,
      veranstaltung: veranstaltungen,
      mode: "einrichtungen",
    });
  }, [itemsDictionary]);

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
              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "POI",
                  plural: "POIs",
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
