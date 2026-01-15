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
import {
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
  fetchGraphQL,
} from "@carma-commons/utils";
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
  updateFeatureCollectionWithNewActions,
} from "./helper/treeHelper";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

type LightboxDispatch = {
  setPhotoUrls: (urls: string[]) => void;
  setIndex: (i: number) => void;
  setTitle: (t: string) => void;
  setCaptions: (t: string[]) => void;
  setVisible: (v: boolean) => void;
};

const TZBaumbewirtschaftung = ({
  jwt,
  login,
  onAuthError,
}: {
  jwt?: string;
  login?: string | null;
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
  const [maxTreeActionId, setMaxTreeActionId] = useState<number | null>(null);
  const [intermediateActions, setIntermediateActions] = useState<any[]>([]);
  const [actionDefinitions, setActionDefinitions] = useState<any[]>([]);
  const [maplibreMap, setMaplibreMap] = useState<any>(null);

  // Poll for new tree actions (id > maxTreeActionId)
  useEffect(() => {
    // Only start polling after initial data is loaded (maxTreeActionId is set)
    if (!jwt || maxTreeActionId === null) return;

    type TreeAction = {
      id: number;
      payload: any;
      status: string;
      status_reason: string;
      fk_tree: number;
      fk_action: number;
      created_at: string;
      action_time: string;
    };

    type NewActionsResponse = {
      tzb_tree_action: TreeAction[];
    };

    const pollNewActions = async () => {
      const query = `{
        tzb_tree_action(where: {id: {_gt: ${maxTreeActionId}}}) {
          id
          payload
          status
          status_reason
          fk_tree
          fk_action
          created_at
          action_time
        }
      }`;

      try {
        const result = await fetchGraphQL<NewActionsResponse>(
          query,
          {},
          jwt,
          APP_CONFIG.restService,
          APP_CONFIG.domain
        );
        const newActions = result?.data?.tzb_tree_action || [];
        if (newActions.length > 0) {
          // Mark actions as intermediate (from polling)
          const markedActions = newActions.map((a) => ({ ...a, intermediate: true }));
          console.log(`[Polling] Found ${newActions.length} new actions:`, markedActions);
          setIntermediateActions((prev) => [...prev, ...markedActions]);
          // Update maxTreeActionId to the highest id from new actions
          const newMaxId = Math.max(...newActions.map((a) => a.id));
          console.log(`[Polling] Updating maxTreeActionId: ${maxTreeActionId} -> ${newMaxId}`);
          setMaxTreeActionId(newMaxId);
        }
      } catch (error) {
        console.error("[Polling] Error polling new tree actions:", error);
      }
    };
    const intervalId = setInterval(pollNewActions, 2500);

    return () => clearInterval(intervalId);
  }, [jwt, maxTreeActionId]);

  // Debug: Log intermediate actions when they change
  useEffect(() => {
    if (intermediateActions.length > 0) {
      console.log("intermediateActions:", intermediateActions);
    }
  }, [intermediateActions]);

  // Merge intermediate actions into feature collection
  useEffect(() => {
    if (
      intermediateActions.length === 0 ||
      !featureCollection ||
      actionDefinitions.length === 0
    ) {
      return;
    }

    console.log("Merging intermediate actions into featureCollection...");

    const { featureCollection: updated } = updateFeatureCollectionWithNewActions(
      featureCollection,
      intermediateActions,
      actionDefinitions
    );

    // Log the feature with the highest action id to verify the merge worked
    let maxId = 0;
    let featureWithMax: any = null;
    updated.features?.forEach((f: any) => {
      (f.properties?.actions || []).forEach((a: any) => {
        if (a.id > maxId) {
          maxId = a.id;
          featureWithMax = f;
        }
      });
    });
    console.log("[Merge] Setting featureCollection. Feature with max action:", {
      featureId: featureWithMax?.id,
      maxActionId: maxId,
      status: featureWithMax?.properties?.latestActionStatus,
      actionCount: featureWithMax?.properties?.actionCount,
      hasIntermediate: featureWithMax?.properties?.actions?.some((a: any) => a.intermediate),
    });

    setFeatureCollection(updated);

    // Update MapLibre source directly to avoid flickering
    console.log("[Merge] maplibreMap available:", !!maplibreMap);
    if (maplibreMap) {
      const source = maplibreMap.getSource('trees');
      console.log("[Merge] source 'trees' found:", !!source);
      if (source) {
        console.log("[Merge] Updating MapLibre source directly");
        source.setData(updated);
      } else {
        // List available sources
        const style = maplibreMap.getStyle();
        console.log("[Merge] Available sources:", Object.keys(style?.sources || {}));
      }
    }

    // Update selectedFeature if it was affected by the merge
    if (selectedFeature) {
      const updatedSelectedFeature = updated.features?.find(
        (f: any) => f.id === selectedFeature.id
      );
      if (updatedSelectedFeature) {
        // Check if this feature was actually updated (has intermediate actions)
        const wasUpdated = updatedSelectedFeature.properties?.actions?.some(
          (a: any) => a.intermediate
        );
        if (wasUpdated) {
          console.log("[Merge] Updating selectedFeature with new data");
          // Recreate info object with updated actions
          updatedSelectedFeature.properties.info = createInfoBoxControlObject(
            updatedSelectedFeature,
            setShowStatusDialog,
            jwt
          );
          updatedSelectedFeature.text = updatedSelectedFeature.properties.info.puretitle;
          setSelectedFeature({ ...updatedSelectedFeature });
        }
      }
    }

    // Clear intermediate actions after merge
    setIntermediateActions([]);
  }, [intermediateActions, actionDefinitions, maplibreMap, selectedFeature, jwt]);

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

        console.log("Loaded treeActions:", treeActions);

        // Store action definitions for later use (enriching intermediate actions)
        setActionDefinitions(actions);

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
                    jwt={jwt}
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
                        setShowStatusDialog,
                        jwt
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
                onMapLibreCoreMapReady={(map) => {
                  console.log("[CismapLayer] MapLibre map ready:", !!map);
                  setMaplibreMap(map);
                }}
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
