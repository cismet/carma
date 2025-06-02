import { useContext, useEffect } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { LightBoxContext } from "react-cismap/contexts/LightBoxContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import { getPoiClusterIconCreatorFunction } from "./helper/styler";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  EmptySearchComponent,
  LibFuzzySearch,
  defaultTypeInference,
} from "@carma-mapping/fuzzy-search";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../version.json";
import SIMComponentDictionary from "@carma-collab/wuppertal/secondary-info-modals";
const SecondaryInfoModal = SIMComponentDictionary["eMobSIM"];
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";

const EMobiKarte = () => {
  const { setClusteringOptions, setFilterState } = useContext(
    FeatureCollectionDispatchContext
  );
  const { secondaryInfoVisible } = useContext(UIContext);
  const { setSecondaryInfoVisible } = useContext(UIDispatchContext);
  const { markerSymbolSize } = useContext(TopicMapStylingContext);
  const { clusteringOptions, selectedFeature, filteredItems, shownFeatures } =
    useContext(FeatureCollectionContext);
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

  useEffect(() => {
    setFilterState({
      nur_online: false,
      oeffnungszeiten: "*",
      stecker: undefined,
      nur_gruener_strom: false,
      nur_schnelllader: false,
    });
  }, []);

  return (
    <>
      <div
        // className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
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
            <div data-test-id="fuzzy-search" className="h-full w-full pl-2">
              <LibFuzzySearch
                priorityTypes={[
                  "emob",
                  "bezirke",
                  "quartiere",
                  "adressen",
                  "streets",
                  "pois",
                  "poisAlternativeNames",
                  "kitas",
                  "schulen",
                ]}
                typeInference={defaultTypeInference}
                pixelwidth={
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
                }
                placeholder="Ladestation | Stadtteil | Adresse | POI"
              />
            </div>
          </Control>
        </ControlLayout>
      </div>
      <TopicMapComponent
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        modalMenu={<Menu />}
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
                  singular: "Ladestation",
                  plural: "Ladestationen",
                },
              },
              noCurrentFeatureTitle: "Keine Ladestationen gefunden",
              noCurrentFeatureContent: (
                <span>
                  Für mehr Ladestationen Ansicht mit verkleinern oder mit dem
                  untenstehenden Link auf das komplette Stadtgebiet zoomen.
                </span>
              ),
            }}
          />
        }
      >
        <TopicMapSelectionContent />

        <FeatureCollection></FeatureCollection>
        {secondaryInfoVisible && (
          <SecondaryInfoModal
            feature={selectedFeature}
            setOpen={setSecondaryInfoVisible}
            versionString={getApplicationVersion(versionData)}
          />
        )}
      </TopicMapComponent>
    </>
  );
};

export default EMobiKarte;
