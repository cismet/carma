import { useContext, useEffect, useState } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";
import FeatureCollection from "react-cismap/FeatureCollection";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import {
  InfoBoxTextTitle,
  InfoBoxTextContent,
  searchTextPlaceholder,
  MenuTooltip,
} from "@carma-collab/wuppertal/vorhabenkarte";
import Menu from "./Menu";
import {
  TopicMapSelectionContent,
  useSelectionTopicMap,
  useSelection,
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
import {
  getApplicationVersion,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
} from "@carma-commons/utils";
import { GenericInfoBoxFromFeature } from "@carma-apps/portals";
import SecondaryInfoModal, { LightboxDispatch } from "./SecondaryInfoModal";
import { FeatureIconOverlay } from "./FeatureIconOverlay";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import { isAreaType } from "@carma-commons/resources";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { useGazData } from "@carma-apps/portals";
import { type GazDataItem } from "@carma-commons/utils";
import versionData from "../../version.json";
import { Topic } from "../App";

interface MapProps {
  topicsWitColors: Topic[];
}

const Map = ({ topicsWitColors }: MapProps) => {
  const {
    setClusteringOptions,
    setSelectedFeatureByPredicate,
    setFilterState,
  } = useContext<typeof FeatureCollectionDispatchContext>(
    FeatureCollectionDispatchContext
  );
  const { markerSymbolSize } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );
  const { clusteringOptions, selectedFeature, filterState } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const lightBoxDispatchContext = useContext(
    LightBoxDispatchContext
  ) as LightboxDispatch;
  const { secondaryInfoVisible } = useContext<typeof UIContext>(UIContext);
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  const { setSecondaryInfoVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { zoomToFeature } = useContext<typeof TopicMapDispatchContext>(
    TopicMapDispatchContext
  );
  const [gazDataWithProjects, setGazDataWithProjects] = useState<GazDataItem[]>(
    []
  );

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
      const gazId = selection.more?.id;
      if (gazId) {
        setSelectedFeatureByPredicate((feature) => {
          try {
            const check = parseInt(feature.properties.id) === selection.more.id;
            if (check === true) {
              zoomToFeature(feature);
            }
            return check;
          } catch (e) {
            return false;
          }
        });
      }
    }, 100);
  };

  useEffect(() => {
    if (markerSymbolSize) {
      setClusteringOptions({
        ...clusteringOptions,
      });
    }
  }, [markerSymbolSize]);

  useEffect(() => {
    if (topicsWitColors.length > 0) {
      const topics = topicsWitColors.map((t) => t.name);
      const newFilterState = { ...filterState };
      newFilterState["topics"] = topics;

      setFilterState(newFilterState);
    }
  }, []);

  useEffect(() => {
    if (
      selectedFeature &&
      selectedFeature.properties.originalPhotos &&
      selectedFeature.properties.originalPhotos.length > 0
    ) {
      const photos = selectedFeature.properties.originalPhotos;
      const urls = selectedFeature.properties.fotos;
      const titleArr = photos.map((p) => p.anzeige);
      lightBoxDispatchContext.setPhotoUrls(urls);
      lightBoxDispatchContext.setCaptions(titleArr);
      lightBoxDispatchContext.setIndex(0);
    }
  }, [selectedFeature]);

  useEffect(() => {
    if (gazData && gazData.length > 0 && gazDataWithProjects.length === 0) {
      const gazDataWithFixedProjects = gazData
        .filter((item) => item.type === "vorhabenkarte")
        .map((i) => {
          return {
            ...i,
            modifiedSearchData: i.string.slice(0, 10),
          };
        });

      setGazDataWithProjects([...gazData, ...gazDataWithFixedProjects]);
    }
  }, [gazData]);

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
              gazData={gazDataWithProjects}
              typeInference={defaultTypeInference}
              onSelection={onGazetteerSelection}
              priorityTypes={["vorhabenkarte", "adressen", "pois"]}
              placeholder={searchTextPlaceholder}
              pixelwidth={
                responsiveState === "normal" ? "300px" : windowSize.width - gap
              }
              config={{ distance: 300 }}
            />
          </div>
        </Control>
        <TopicMapComponent
          modalMenu={<Menu topicsWitColors={topicsWitColors} />}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          photoLightBox
          applicationMenuTooltipString={<MenuTooltip />}
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
                    singular: "Vorhaben",
                    plural: "Vorhaben",
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
              versionString={getApplicationVersion(versionData)}
              feature={selectedFeature}
              setOpen={setSecondaryInfoVisible}
            />
          )}
          <TopicMapSelectionContent />
          <FeatureCollection></FeatureCollection>
        </TopicMapComponent>
      </ControlLayout>
      <FeatureIconOverlay zoomLevel={11} markerSymbolSize={markerSymbolSize} />
    </div>
  );
};

export default Map;
