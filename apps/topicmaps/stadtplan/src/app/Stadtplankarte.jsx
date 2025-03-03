import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { LightBoxContext } from "react-cismap/contexts/LightBoxContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  InfoBoxTextContent,
  InfoBoxTextTitle,
  MenuTooltip,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/stadtplan";
import { isAreaType } from "@carma-commons/resources";
import {
  LibFuzzySearch,
  EmptySearchComponent,
} from "@carma-mapping/fuzzy-search";
import IconComp from "react-cismap/commons/Icon";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import Menu from "./Menu";

const Stadtplankarte = ({ poiColors }) => {
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const lightBoxContext = useContext(LightBoxContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature } = useContext(
    FeatureCollectionContext
  );

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: markerSymbolSize,
          poiColors,
        }),
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
        gazetteerSearchControl={true}
        gazetteerSearchComponent={EmptySearchComponent}
        applicationMenuTooltipString={<MenuTooltip />}
        infoBox={
          <GenericInfoBoxFromFeature
            pixelwidth={350}
            config={{
              displaySecondaryInfoAction: false,
              city: "Wuppertal",
              navigator: {
                noun: {
                  singular: "POI",
                  plural: "POIs",
                },
              },
              noFeatureTitle: <InfoBoxTextTitle />,
              noCurrentFeatureContent: <InfoBoxTextContent />,
            }}
            captionFactory={(linkUrl, feature) => {
              const urheber =
                feature?.properties?.urheber_foto || "Stadt Wuppertal";
              let link = "https://www.wuppertal.de/service/impressum.php";

              if (urheber === "Stadt Wuppertal, Wuppertal Marketing GmbH") {
                link =
                  "https://www.wuppertal.de/microsite/WMG/impressum_431218.php";
              } else if (urheber === "Stadt Wuppertal, Medienzentrum") {
                link =
                  "https://www.wuppertal.de/kultur-bildung/schule/medienzentrum/index.php";
              }

              return (
                <a href={link} target="_fotos">
                  <IconComp name="copyright" /> {urheber}
                </a>
              );
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
          pixelwidth="100%"
          placeholder={searchTextPlaceholder}
        />
      </div>
    </>
  );
};

export default Stadtplankarte;
