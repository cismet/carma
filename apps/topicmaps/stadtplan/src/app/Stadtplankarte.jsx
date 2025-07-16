import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { LightBoxContext } from "react-cismap/contexts/LightBoxContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import {
  GenericInfoBoxFromFeature,
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  InfoBoxTextContent,
  InfoBoxTextTitle,
  MenuTooltip,
  searchTextPlaceholder,
} from "@carma-collab/wuppertal/stadtplan";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import IconComp from "react-cismap/commons/Icon";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import Menu from "./Menu";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { RoutedMapLocateControl } from "@carma-mapping/components";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { FullscreenControl, ZoomControl } from "@carma-mapping/components/";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";

const Stadtplankarte = ({ poiColors }) => {
  const { setClusteringOptions } = useContext(FeatureCollectionDispatchContext);
  const lightBoxContext = useContext(LightBoxContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature, filterState } = useContext(
    FeatureCollectionContext
  );
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );
  useSelectionTopicMap();

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
              placeholder={searchTextPlaceholder}
            />
          </div>
        </Control>
        <TopicMapComponent
          modalMenu={<Menu />}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
          applicationMenuTooltipString={<MenuTooltip />}
          infoBox={
            filterState === undefined || filterState.positiv.length > 0 ? (
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
            ) : (
              <div></div>
            )
          }
        >
          <TopicMapSelectionContent />
          <FeatureCollection></FeatureCollection>
        </TopicMapComponent>
      </ControlLayout>
    </div>
  );
};

export default Stadtplankarte;
