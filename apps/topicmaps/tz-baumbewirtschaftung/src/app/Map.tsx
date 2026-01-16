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

// Check for URL parameters (supports hash-based routing)
const getUrlParam = (param: string) => {
  const hashParams = window.location.hash.split("?")[1];
  if (hashParams) {
    return new URLSearchParams(hashParams).has(param);
  }
  return new URLSearchParams(window.location.search).has(param);
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
  const isFollowMode = getUrlParam("followMode");
  const isCrossHairEnabled = getUrlParam("crossHair");
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
  const [upcomingActions, setUpcomingActions] = useState<any[]>([]);
  const [username, setUsername] = useState<string | null>(null);

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
          const markedActions = newActions.map((a) => ({
            ...a,
            intermediate: true,
          }));
          console.log(`[Polling] Found ${newActions.length} new action(s)`);
          setIntermediateActions((prev) => [...prev, ...markedActions]);
          const newMaxId = Math.max(...newActions.map((a) => a.id));
          setMaxTreeActionId(newMaxId);
        }
      } catch (error) {
        console.error("[Polling] Error polling new tree actions:", error);
      }
    };
    const intervalId = setInterval(pollNewActions, 2500);

    return () => clearInterval(intervalId);
  }, [jwt, maxTreeActionId]);


  // Handler for when user creates an action - add to upcoming for optimistic display
  const handleUpcomingAction = (actionPayload: any) => {
    const upcomingAction = {
      ...actionPayload,
      upcoming: true,
      id: `upcoming-${Date.now()}`,
    };
    setUpcomingActions((prev) => [...prev, upcomingAction]);
  };

  // Merge upcoming actions into display for optimistic updates
  useEffect(() => {
    if (upcomingActions.length === 0 || !featureCollection) {
      return;
    }

    // Create a temporary merged featureCollection for display
    const updatedFeatures = featureCollection.features.map((f: any) => {
      const upcomingForTree = upcomingActions.filter((a) => a.fk_tree === f.id);

      if (upcomingForTree.length === 0) {
        return f;
      }

      // Merge upcoming actions with existing ones
      const existingActions = f.properties.actions || [];
      const mergedActions = [...existingActions, ...upcomingForTree];

      return {
        ...f,
        properties: {
          ...f.properties,
          actions: mergedActions,
          latestActionStatus:
            upcomingForTree[upcomingForTree.length - 1].status,
          hasUpcomingActions: true,
          actionCount: mergedActions.length,
        },
      };
    });

    const updated = { ...featureCollection, features: updatedFeatures };
    setFeatureCollection(updated);

    // Update MapLibre source
    if (maplibreMap) {
      const source = maplibreMap.getSource("trees");
      if (source) {
        source.setData(updated);
      }
    }

    // Update selected feature if affected
    if (selectedFeature) {
      const updatedSelectedFeature = updatedFeatures.find(
        (f: any) => f.id === selectedFeature.id
      );
      if (updatedSelectedFeature?.properties?.hasUpcomingActions) {
        updatedSelectedFeature.properties.info = createInfoBoxControlObject(
          updatedSelectedFeature,
          setShowStatusDialog,
          jwt
        );
        updatedSelectedFeature.text =
          updatedSelectedFeature.properties.info.puretitle;
        setSelectedFeature({ ...updatedSelectedFeature });
      }
    }
  }, [upcomingActions]);

  // Merge intermediate actions into feature collection
  useEffect(() => {
    if (
      intermediateActions.length === 0 ||
      !featureCollection ||
      actionDefinitions.length === 0
    ) {
      return;
    }

    const { featureCollection: updated } =
      updateFeatureCollectionWithNewActions(
        featureCollection,
        intermediateActions,
        actionDefinitions
      );

    setFeatureCollection(updated);

    // Update MapLibre source directly to avoid flickering
    if (maplibreMap) {
      const source = maplibreMap.getSource("trees");
      if (source) {
        source.setData(updated);
      }
    }

    // Update selectedFeature if it was affected by the merge
    if (selectedFeature) {
      const updatedSelectedFeature = updated.features?.find(
        (f: any) => f.id === selectedFeature.id
      ) as any;
      if (updatedSelectedFeature) {
        const wasUpdated = updatedSelectedFeature.properties?.actions?.some(
          (a: any) => a.intermediate
        );
        if (wasUpdated) {
          updatedSelectedFeature.properties.info = createInfoBoxControlObject(
            updatedSelectedFeature,
            setShowStatusDialog,
            jwt
          );
          updatedSelectedFeature.text =
            updatedSelectedFeature.properties.info.puretitle;
          setSelectedFeature({ ...updatedSelectedFeature });
        }
      }
    }

    // Remove matching upcoming actions now that we have real data
    if (upcomingActions.length > 0) {
      const affectedTreeIds = new Set(
        intermediateActions.map((a) => a.fk_tree)
      );
      const remainingUpcoming = upcomingActions.filter(
        (a) => !affectedTreeIds.has(a.fk_tree)
      );
      if (remainingUpcoming.length !== upcomingActions.length) {
        setUpcomingActions(remainingUpcoming);
      }
    }

    // Follow mode: select the affected feature to show the infobox
    if (isFollowMode && intermediateActions.length > 0) {
      const affectedTreeId = intermediateActions[0].fk_tree;
      const affectedFeature = updated.features?.find(
        (f: any) => f.id === affectedTreeId
      ) as any;

      if (affectedFeature) {
        // Parse actions and create info object for selection
        if (typeof affectedFeature.properties.actions === "string") {
          affectedFeature.properties.actions = JSON.parse(
            affectedFeature.properties.actions
          );
        }
        affectedFeature.properties.info = createInfoBoxControlObject(
          affectedFeature,
          setShowStatusDialog,
          jwt
        );
        affectedFeature.text = affectedFeature.properties.info.puretitle;

        // Select the feature to show infobox
        setSelectedFeature({ ...affectedFeature });
      }
    }

    // Clear intermediate actions after merge
    setIntermediateActions([]);
  }, [
    intermediateActions,
    actionDefinitions,
    maplibreMap,
    selectedFeature,
    jwt,
    upcomingActions,
    isFollowMode,
  ]);

  useEffect(() => {
    if (!jwt) {
      return;
    }

    // Extract username from JWT
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]));
      if (payload.sub) {
        setUsername(payload.sub);
      }
    } catch {
      // JWT decode failed
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

        // Store action definitions for later use (enriching intermediate actions)
        setActionDefinitions(actions);

        // Enrich feature collection with actions
        const { featureCollection: enriched, maxTreeActionId: maxId } =
          enrichFeatureCollectionWithActions(treesFC, treeActions, actions);

        setFeatureCollection(enriched);
        setMaxTreeActionId(maxId);

        console.log(
          `[Data] Loaded ${treesFC.features.length} trees, ${treeActions.length} actions`
        );
      } catch (error) {
        console.error("[Data] Error loading:", error);
        if ((error as any)?.status === 401) {
          onAuthError?.();
        }
      }
    })();
  }, [jwt]);

  // Crosshair visualization for selected feature
  useEffect(() => {
    if (!maplibreMap || !isCrossHairEnabled) return;

    const CROSSHAIR_SOURCE = "crosshair-source";
    const CROSSHAIR_LAYER = "crosshair-layer";
    const LINE_EXTENT = 10; // degrees to extend in each direction

    // Remove existing crosshair if no selection
    if (!selectedFeature?.geometry?.coordinates) {
      if (maplibreMap.getLayer(CROSSHAIR_LAYER)) {
        maplibreMap.removeLayer(CROSSHAIR_LAYER);
      }
      if (maplibreMap.getSource(CROSSHAIR_SOURCE)) {
        maplibreMap.removeSource(CROSSHAIR_SOURCE);
      }
      return;
    }

    const [lng, lat] = selectedFeature.geometry.coordinates;
    const pixelGap = (markerSymbolSize || 30) / 2 + 2; // radius + small buffer

    // Function to calculate line coordinates based on current zoom
    const calculateCrosshairCoords = () => {
      const centerPixel = maplibreMap.project([lng, lat]);
      const north = maplibreMap.unproject([centerPixel.x, centerPixel.y - pixelGap]);
      const south = maplibreMap.unproject([centerPixel.x, centerPixel.y + pixelGap]);
      const east = maplibreMap.unproject([centerPixel.x + pixelGap, centerPixel.y]);
      const west = maplibreMap.unproject([centerPixel.x - pixelGap, centerPixel.y]);
      return { north, south, east, west };
    };

    const coords = calculateCrosshairCoords();

    // Create crosshair GeoJSON with 4 separate lines
    const crosshairGeoJSON = {
      type: "FeatureCollection",
      features: [
        // North line
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [coords.north.lng, coords.north.lat],
              [lng, lat + LINE_EXTENT],
            ],
          },
        },
        // South line
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [coords.south.lng, coords.south.lat],
              [lng, lat - LINE_EXTENT],
            ],
          },
        },
        // East line
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [coords.east.lng, coords.east.lat],
              [lng + LINE_EXTENT, lat],
            ],
          },
        },
        // West line
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [coords.west.lng, coords.west.lat],
              [lng - LINE_EXTENT, lat],
            ],
          },
        },
      ],
    };

    // Add or update source
    const source = maplibreMap.getSource(CROSSHAIR_SOURCE);
    if (source) {
      source.setData(crosshairGeoJSON);
    } else {
      maplibreMap.addSource(CROSSHAIR_SOURCE, {
        type: "geojson",
        data: crosshairGeoJSON,
      });

      maplibreMap.addLayer({
        id: CROSSHAIR_LAYER,
        type: "line",
        source: CROSSHAIR_SOURCE,
        paint: {
          "line-color": "#333333",
          "line-width": 3,
          "line-opacity": 0.8,
        },
      });
    }

    // Update crosshair on zoom
    const updateCrosshair = () => {
      const newCoords = calculateCrosshairCoords();

      crosshairGeoJSON.features[0].geometry.coordinates = [[newCoords.north.lng, newCoords.north.lat], [lng, lat + LINE_EXTENT]];
      crosshairGeoJSON.features[1].geometry.coordinates = [[newCoords.south.lng, newCoords.south.lat], [lng, lat - LINE_EXTENT]];
      crosshairGeoJSON.features[2].geometry.coordinates = [[newCoords.east.lng, newCoords.east.lat], [lng + LINE_EXTENT, lat]];
      crosshairGeoJSON.features[3].geometry.coordinates = [[newCoords.west.lng, newCoords.west.lat], [lng - LINE_EXTENT, lat]];

      const src = maplibreMap.getSource(CROSSHAIR_SOURCE);
      if (src) {
        src.setData(crosshairGeoJSON);
      }
    };

    maplibreMap.on("zoomend", updateCrosshair);

    return () => {
      maplibreMap.off("zoomend", updateCrosshair);
    };
  }, [maplibreMap, selectedFeature, isCrossHairEnabled, markerSymbolSize]);

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

                      setSelectedFeature(feature);
                    } else {
                      setSelectedFeature(undefined);
                    }
                  })();
                }}
                style={treeStyle}
                type="vector"
                onMapLibreCoreMapReady={(map) => {
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
          onCancel={() => {}}
          onUpcomingAction={handleUpcomingAction}
          onClose={() => {}}
          username={username}
        />
      )}
    </div>
  );
};

export default TZBaumbewirtschaftung;
