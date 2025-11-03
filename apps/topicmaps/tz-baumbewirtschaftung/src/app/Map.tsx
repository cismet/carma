import { useContext, useEffect, useState } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import Modal from "./Modal";
import SetStatusDialog from "./SetStatusDialog";
import {
  createVectorFeature,
  FeatureInfobox,
  SandboxedEvalProvider,
  TopicMapSelectionContent,
  useSelectionTopicMap,
  getInfoBoxControlObjectFromMappingAndVectorFeature,
} from "@carma-appframeworks/portals";
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
import CismapLayer from "react-cismap/CismapLayer";
import versionData from "../version.json";
import { md5ActionFetchDAQ } from "react-cismap/tools/fetching";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { APP_CONFIG } from "../config/appConfig";
import { useTreeStyle } from "./hooks/useTreeStyle";
import {
  createInfoBoxControlObject,
  enrichFeatureCollectionWithActions,
} from "./helper/treeHelper";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

type LightboxDispatch = {
  setPhotoUrls: (urls: string[]) => void;
  setIndex: (i: number) => void;
  setTitle: (t: string) => void;
  setCaptions: (t: string[]) => void;
  setVisible: (v: boolean) => void;
};
const baseUrl = window.location.origin + window.location.pathname;

const TZBaumbewirtschaftung = ({
  jwt,
  onAuthError,
}: {
  jwt?: string;
  onAuthError?: () => void;
}) => {
  const { markerSymbolSize } = useContext(TopicMapStylingContext) as any;
  const { clusteringOptions } = useContext(FeatureCollectionContext) as any;
  const [selectedFeature, setSelectedFeature] = useState<any>();
  const [featureCollection, setFeatureCollection] = useState<any>();
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as any;
  useSelectionTopicMap();
  const lightBoxDispatchContext = useContext(
    LightBoxDispatchContext
  ) as LightboxDispatch;

  const { appKey } = useContext(TopicMapContext) as any;
  const [maxTreeActionId, setMaxTreeActionId] = useState<number>(0);

  useEffect(() => {
    if (!jwt) {
      console.log("Waiting for JWT...");
      return;
    }

    (async () => {
      try {
        // Load all three data sources using DAQ API
        const [treesResult, treeActionsResult, actionsResult] =
          await Promise.all([
            md5ActionFetchDAQ(
              appKey,
              APP_CONFIG.restService,
              jwt,
              APP_CONFIG.daqKeys.trees
            ),
            md5ActionFetchDAQ(
              appKey,
              APP_CONFIG.restService,
              jwt,
              APP_CONFIG.daqKeys.treeActions
            ),
            md5ActionFetchDAQ(
              appKey,
              APP_CONFIG.restService,
              jwt,
              APP_CONFIG.daqKeys.actions
            ),
          ]);

        const treesFC = treesResult.data as any;
        const treeActions = treeActionsResult.data as any[];
        const actions = actionsResult.data as any[];

        // Enrich feature collection with actions
        const { featureCollection: enriched, maxTreeActionId: maxId } =
          enrichFeatureCollectionWithActions(treesFC, treeActions, actions);

        setFeatureCollection(enriched);
        setMaxTreeActionId(maxId);

        console.log(
          `Loaded ${treesFC.features.length} trees, ${treeActions.length} tree actions, max ID: ${maxId}`
        );
        console.log(
          `Data timestamps - Trees: ${treesResult.time}, Actions: ${treeActionsResult.time}`
        );
      } catch (error) {
        console.error("Error loading data:", error);
        // Handle 401 errors (JWT expired) by showing login modal again
        if ((error as any)?.status === 401) {
          console.log("JWT expired, user needs to re-login");
          onAuthError?.();
        }
      }
    })();
  }, [jwt]);

  const treeStyle = useTreeStyle(featureCollection, markerSymbolSize);

  return (
    <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
      <SandboxedEvalProvider>
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
                  responsiveState === "normal"
                    ? "300px"
                    : windowSize.width - gap
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
            infoBox={
              <FeatureInfobox
                collapsible={responsiveState !== "small"}
                selectedFeature={selectedFeature}
                versionData={versionData}
                bigMobileIconsInsteadOfCollapsing={true}
                Modal={(props: any) => (
                  <Modal
                    {...props}
                    lightBoxDispatchContext={lightBoxDispatchContext}
                  />
                )}
              />
            }
            contactButtonEnabled={false}
          >
            <TopicMapSelectionContent />

            {featureCollection && (
              <CismapLayer
                key={`tree-layer-${markerSymbolSize}`}
                pane="additionalLayers0"
                selectionEnabled={true}
                manualSelectionManagement={false}
                logMapLibreErrors={true}
                onSelectionChanged={(e) => {
                  (async () => {
                    const feature = e.hit;
                    if (feature) {
                      // if it is confuigured in a string array (comes form vectorlayer metadata)
                      // const infoBoxControlObject =
                      //   await getInfoBoxControlObjectFromMappingAndVectorFeature(
                      //     {
                      //       mapping: infoBoxMapping,
                      //       selectedVectorFeature: hit,
                      //     }
                      //   );

                      // Parse actions first before creating info object
                      feature.properties.actions = JSON.parse(
                        feature.properties.actions
                      );

                      // add infoBoxControlObject
                      feature.properties.info = createInfoBoxControlObject(
                        feature,
                        baseUrl,
                        setShowStatusDialog
                      );
                      feature.text = feature.properties.info.puretitle;

                      console.log("xxx feature", feature);
                      setSelectedFeature(feature);
                    } else {
                      setSelectedFeature(undefined);
                    }
                  })();
                }}
                style={treeStyle}
                type="vector"
              />
            )}
          </TopicMapComponent>
        </ControlLayout>
      </SandboxedEvalProvider>
      {showStatusDialog && (
        <SetStatusDialog
          feature={selectedFeature}
          close={() => setShowStatusDialog(false)}
          onCancel={() => {
            console.log("Status dialog cancelled");
          }}
          onClose={
            ((parameter: any) => {
              console.log("Status changed:", parameter);
              // Mock: Update feature status
              if (selectedFeature) {
                console.log(
                  "Would update feature:",
                  selectedFeature.id,
                  "with:",
                  parameter
                );
              }
            }) as any
          }
        />
      )}
    </div>
  );
};

export default TZBaumbewirtschaftung;
