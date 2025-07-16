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
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  defaultTypeInference,
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { GenericInfoBoxFromFeature } from "@carma-apps/portals";

const Baederkarte = () => {
  const { setSelectedFeatureByPredicate, setClusteringOptions } = useContext(
    FeatureCollectionDispatchContext
  );
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions } = useContext(FeatureCollectionContext);

  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  useSelectionTopicMap();

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
        iconCreateFunction: getPoiClusterIconCreatorFunction,
      });
    }
  }, [markerSymbolSize]);

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
          <div style={{ marginTop: "4px" }}>
            <LibFuzzySearch
              pixelwidth={
                responsiveState === "normal" ? "300px" : windowSize.width - gap
              }
              placeholder="Stadtteil | Adresse | POI"
              priorityTypes={[
                "pois",
                "poisAlternativeNames",
                "bezirke",
                "quartiere",
                "adressen",
                "streets",
                "schulen",
                "kitas",
              ]}
              typeInference={defaultTypeInference}
            />
          </div>
        </Control>
        <TopicMapComponent
          modalMenu={<Menu />}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
          applicationMenuTooltipString="Einstellungen | Kompaktanleitung"
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          contactButtonEnabled={false}
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
      </ControlLayout>
    </div>
  );
};

export default Baederkarte;
