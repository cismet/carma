import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";

const Baederkarte = () => {
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);

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
    }, [100]);
  };

  return (
    <>
      <TopicMapComponent
        modalMenu={<Menu />}
        locatorControl={true}
        gazetteerSearchControl={false}
        gazetteerSearchComponent={<></>}
        applicationMenuTooltipString="Einstellungen | Kompaktanleitung"
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={350}
            config={{
              displaySecondaryInfoAction: false,
              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "Bad",
                  plural: "Bäder",
                },
              },
              noCurrentFeatureTitle: "Keine Bäder gefunden",
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
        <TopicMapSelectionContent />

        <FeatureCollection></FeatureCollection>
      </TopicMapComponent>
      <div className="custom-left-control">
        <LibFuzzySearch
          gazData={gazData}
          onSelection={onGazetteerSelection}
          placeholder="Stadtteil | Adresse | POI"
        />
      </div>
    </>
  );
};

export default Baederkarte;
