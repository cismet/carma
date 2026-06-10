import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import Menu from "./Menu";
import Modal from "./Modal";
import SetStatusDialog from "./SetStatusDialog";
import {
  FeatureInfobox,
  TopicMapSelectionContent,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import {
  createVectorFeature,
  getInfoBoxControlObjectFromMappingAndVectorFeature,
} from "@carma-mapping/utils";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import {
  defaultTypeInference,
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlLayout,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";
import {
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
  fetchGraphQL,
} from "@carma-commons/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouseChimney } from "@fortawesome/free-solid-svg-icons";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import CismapLayer from "react-cismap/CismapLayer";
import versionData from "../version.json";
import { md5ActionFetchDAQ } from "react-cismap/tools/fetching";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { APP_CONFIG } from "../config/appConfig";
import { useTreeStyle } from "./hooks/useTreeStyle";
import {
  createInfoBoxControlObject,
  enrichFeatureCollection,
  maxActionIdInLegacyFC,
  updateFeatureCollectionWithNewActions,
} from "./helper/treeHelper";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { treeMatches, useKampagne } from "./context/KampagneContext";

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
  onConnectionError,
  followMode = false,
  crossHair = false,
}: {
  jwt?: string;
  login?: string | null;
  onAuthError?: () => void;
  onConnectionError?: (hasError: boolean) => void;
  followMode?: boolean;
  crossHair?: boolean;
}) => {
  const isFollowMode = followMode;
  const isCrossHairEnabled = crossHair;
  const { markerSymbolSize } = useContext(TopicMapStylingContext) as any;
  const { clusteringOptions } = useContext(FeatureCollectionContext) as any;
  const [selectedFeature, setSelectedFeature] = useState<any>();
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  ) as any;
  useSelectionTopicMap();
  const lightBoxDispatchContext = useContext(
    LightBoxDispatchContext
  ) as LightboxDispatch;

  const { appKey, routedMapRef } = useContext(TopicMapContext) as any;
  const [maxTreeActionId, setMaxTreeActionId] = useState<number | null>(null);
  const [intermediateActions, setIntermediateActions] = useState<any[]>([]);
  const [actionDefinitions, setActionDefinitions] = useState<any[]>([]);
  const [maplibreMap, setMaplibreMap] = useState<any>(null);
  const [upcomingActions, setUpcomingActions] = useState<any[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  // Single source of truth: the full enriched FC. Live updates (polling,
  // optimistic) and the initial load all write here. The map shows a derived,
  // kampagne-filtered view (`featureCollection`) computed from it.
  const [unfilteredFeatureCollection, setUnfilteredFeatureCollection] =
    useState<any>();
  const { ready: kampagneReady, showAll, effectiveCampaignIds } = useKampagne();

  const featureCollection = useMemo(() => {
    if (!unfilteredFeatureCollection || !kampagneReady) return undefined;
    const features =
      effectiveCampaignIds.length === 0
        ? []
        : unfilteredFeatureCollection.features.filter((f: any) =>
            treeMatches(f, effectiveCampaignIds)
          );
    return { ...unfilteredFeatureCollection, features };
  }, [unfilteredFeatureCollection, effectiveCampaignIds, kampagneReady]);

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

        // Check for HTTP errors (fetchGraphQL returns ok: false for HTTP errors)
        if (!result.ok) {
          if (result.status === 401) {
            // Unauthorized - trigger re-login
            onAuthError?.();
            return;
          } else {
            // Other HTTP errors - show connection error indicator
            onConnectionError?.(true);
            return;
          }
        }

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
        // Network errors (offline, DNS failure, etc.) end up here
        console.error("[Polling] Network error:", error);
        onConnectionError?.(true);
      }
    };
    const intervalId = setInterval(pollNewActions, 2500);

    return () => clearInterval(intervalId);
  }, [jwt, maxTreeActionId, onAuthError, onConnectionError]);

  // Handler for when user creates an action - add to upcoming for optimistic display
  const handleUpcomingAction = (actionPayload: any) => {
    const upcomingAction = {
      ...actionPayload,
      upcoming: true,
      id: `upcoming-${Date.now()}`,
    };
    setUpcomingActions((prev) => [...prev, upcomingAction]);
  };

  // Merge upcoming actions into the source FC for optimistic updates
  useEffect(() => {
    if (upcomingActions.length === 0 || !unfilteredFeatureCollection) {
      return;
    }

    const updatedFeatures = unfilteredFeatureCollection.features.map(
      (f: any) => {
        const upcomingForTree = upcomingActions.filter(
          (a) => a.fk_tree === f.id
        );

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
      }
    );

    const updated = {
      ...unfilteredFeatureCollection,
      features: updatedFeatures,
    };
    setUnfilteredFeatureCollection(updated);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingActions]);

  // Merge intermediate actions into the source feature collection
  useEffect(() => {
    if (
      intermediateActions.length === 0 ||
      !unfilteredFeatureCollection ||
      actionDefinitions.length === 0
    ) {
      return;
    }

    const { featureCollection: updated } =
      updateFeatureCollectionWithNewActions(
        unfilteredFeatureCollection,
        intermediateActions,
        actionDefinitions
      );

    setUnfilteredFeatureCollection(updated);

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

    // Follow mode: select the affected feature to show the infobox.
    // Only jump to trees the user can actually see under the current filter.
    if (isFollowMode && intermediateActions.length > 0) {
      const affectedTreeId = intermediateActions[0].fk_tree;
      const affectedFeature = updated.features?.find(
        (f: any) => f.id === affectedTreeId
      ) as any;

      if (
        affectedFeature &&
        treeMatches(affectedFeature, effectiveCampaignIds)
      ) {
        // Parse actions and create info object for selection
        if (typeof affectedFeature.properties.actions === "string") {
          affectedFeature.properties.actions = JSON.parse(
            affectedFeature.properties.actions
          );
        }
        if (typeof affectedFeature.properties.kampagnen === "string") {
          affectedFeature.properties.kampagnen = JSON.parse(
            affectedFeature.properties.kampagnen
          );
        }
        affectedFeature.properties.info = createInfoBoxControlObject(
          affectedFeature,
          setShowStatusDialog,
          jwt
        );
        affectedFeature.text = affectedFeature.properties.info.puretitle;

        // Pan to feature if not visible (without changing zoom)
        if (routedMapRef?.leafletMap?.leafletElement) {
          try {
            const leafletMap = routedMapRef.leafletMap.leafletElement;
            const [lng, lat] = affectedFeature.geometry.coordinates;
            const featureLatLng = [lat, lng] as [number, number];
            const bounds = leafletMap.getBounds();

            if (!bounds.contains(featureLatLng)) {
              leafletMap.panTo(featureLatLng, { animate: true, duration: 2 });
            }
          } catch (error) {
            console.error("Error panning to feature:", error);
          }
        }

        // Select the feature to show infobox
        setSelectedFeature({ ...affectedFeature });
      }
    }

    // Clear intermediate actions after merge
    setIntermediateActions([]);
  }, [
    intermediateActions,
    actionDefinitions,
    unfilteredFeatureCollection,
    selectedFeature,
    jwt,
    upcomingActions,
    isFollowMode,
    routedMapRef,
    effectiveCampaignIds,
  ]);

  useEffect(() => {
    if (!jwt) {
      return;
    }

    // Extract username from JWT
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      if (payload.sub) {
        setUsername(payload.sub);
      }
    } catch {
      // JWT decode failed
    }

    (async () => {
      try {
        // Trees + their embedded actions and kampagnen come from the legacy all-in-one DAQ.
        // Action definitions are kept separate so the polling path can still enrich
        // newly inserted tree actions with their key/description.
        const [legacyResult, actionsResult] = await Promise.all([
          md5ActionFetchDAQ(
            appKey,
            APP_CONFIG.restService,
            jwt,
            APP_CONFIG.daqKeys.legacy
          ),
          md5ActionFetchDAQ(
            appKey,
            APP_CONFIG.restService,
            jwt,
            APP_CONFIG.daqKeys.actions
          ),
        ]);

        const legacyFC = legacyResult.data as any;
        const actions = (actionsResult.data as any[]) || [];
        setActionDefinitions(actions);

        const enriched = enrichFeatureCollection(legacyFC);
        const maxId = maxActionIdInLegacyFC(legacyFC);

        setUnfilteredFeatureCollection(enriched);
        setMaxTreeActionId(maxId);

        console.log(
          `[Data] Loaded ${legacyFC.features.length} trees (legacy DAQ, actions embedded)`
        );
      } catch (error) {
        console.error("[Data] Error loading:", error);
        const status = (error as any)?.status;
        if (status === 401) {
          // Unauthorized - trigger re-login
          onAuthError?.();
        } else {
          // Other errors (network, etc.) - show connection error indicator
          onConnectionError?.(true);
        }
      }
    })();
  }, [jwt]);

  // Push the derived (filtered) FC into MapLibre. CismapLayer doesn't reactively
  // pick up data changes, so every update — initial load, polling, optimistic,
  // and filter switches — flows to the map through this single imperative path.
  useEffect(() => {
    if (!maplibreMap || !featureCollection) return;
    // After a user switch the previous map instance is torn down but the
    // React state still holds the stale reference; MapLibre's destructor
    // sets `style = undefined`, so any `.getSource()` call throws.
    if (!maplibreMap.style) return;
    const source = maplibreMap.getSource("trees");
    if (source) {
      source.setData(featureCollection);
    }
  }, [maplibreMap, featureCollection]);

  // Fit the leaflet map to the bbox of the current featureCollection.
  // Shared by the home button and the contractor auto-fit effect below.
  const fitToFeatures = useCallback(() => {
    try {
      if (!routedMapRef?.leafletMap?.leafletElement) return;
      if (!featureCollection?.features?.length) return;

      let minLng = Infinity,
        minLat = Infinity;
      let maxLng = -Infinity,
        maxLat = -Infinity;

      featureCollection.features.forEach((feature: any) => {
        const coords = feature.geometry?.coordinates;
        if (!coords || coords.length < 2) return;
        const [lng, lat] = coords;
        if (typeof lng !== "number" || typeof lat !== "number") return;
        if (lat < 50 || lat > 52 || lng < 6 || lng > 8) return;

        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });

      if (minLng === Infinity || minLat === Infinity) return;

      const padding = 0.01;
      const bounds: [[number, number], [number, number]] = [
        [minLat - padding, minLng - padding],
        [maxLat + padding, maxLng + padding],
      ];

      const leafletMap = routedMapRef.leafletMap.leafletElement;
      leafletMap.options.zoomSnap = 0.1;
      leafletMap.fitBounds(bounds);
    } catch (error) {
      console.error("Error fitting bounds:", error);
    }
  }, [routedMapRef, featureCollection]);

  // #4031: Auto-fit a contractor's view to their kampagne bbox on initial
  // login. Skipped when the URL already positions the map (shared link, PR
  // deployment, etc.). Fires once per jwt — reset on user switch.
  const hasAutoFittedRef = useRef(false);

  useEffect(() => {
    hasAutoFittedRef.current = false;
  }, [jwt]);

  useEffect(() => {
    if (hasAutoFittedRef.current) return;
    if (!jwt) return;
    if (!kampagneReady || showAll) return;
    if (!featureCollection || featureCollection.features.length === 0) return;
    if (getUrlParam("lat") || getUrlParam("lng")) return;
    if (!routedMapRef?.leafletMap?.leafletElement) return;

    fitToFeatures();
    hasAutoFittedRef.current = true;
  }, [
    jwt,
    kampagneReady,
    showAll,
    featureCollection,
    routedMapRef,
    fitToFeatures,
  ]);

  // Drop the selection if the selected tree is no longer in the filtered view.
  useEffect(() => {
    if (!featureCollection || !selectedFeature) return;
    const stillVisible = featureCollection.features.some(
      (f: any) => f.id === selectedFeature.id
    );
    if (!stillVisible) {
      setSelectedFeature(undefined);
    }
  }, [featureCollection, selectedFeature]);

  // Crosshair visualization for selected feature
  useEffect(() => {
    const CROSSHAIR_SOURCE = "crosshair-source";
    const CROSSHAIR_LAYER = "crosshair-layer";

    // Helper to remove crosshair
    const removeCrosshair = () => {
      if (!maplibreMap || !maplibreMap.style) return;
      if (maplibreMap.getLayer(CROSSHAIR_LAYER)) {
        maplibreMap.removeLayer(CROSSHAIR_LAYER);
      }
      if (maplibreMap.getSource(CROSSHAIR_SOURCE)) {
        maplibreMap.removeSource(CROSSHAIR_SOURCE);
      }
    };

    // Stale map reference after a user switch — see note on the FC effect above.
    if (maplibreMap && !maplibreMap.style) return;

    // If disabled or no map, remove crosshair and return
    if (!maplibreMap || !isCrossHairEnabled) {
      removeCrosshair();
      return;
    }

    const LINE_EXTENT = 10; // degrees to extend in each direction

    // Gap in degrees at reference zoom levels (tuned for consistent visual gap)
    const GAP_AT_ZOOM_22 = 0.000004; // very zoomed in - tiny degree gap
    const GAP_AT_ZOOM_13 = 0.001; // zoomed out - larger degree gap

    // Exponential interpolation (zoom levels scale exponentially)
    const getGapForZoom = (zoom: number) => {
      if (zoom >= 22) return GAP_AT_ZOOM_22;
      if (zoom <= 13) return GAP_AT_ZOOM_13;
      // Exponential interpolation between zoom 13 and 22
      const t = (zoom - 13) / (22 - 13);
      return GAP_AT_ZOOM_13 * Math.pow(GAP_AT_ZOOM_22 / GAP_AT_ZOOM_13, t);
    };

    // Remove existing crosshair if no selection
    if (!selectedFeature?.geometry?.coordinates) {
      removeCrosshair();
      return;
    }

    const [lng, lat] = selectedFeature.geometry.coordinates;

    // Calculate gap based on current zoom
    // Longitude gap needs adjustment: 1° longitude is shorter than 1° latitude at higher latitudes
    const lngCorrectionFactor = 1 / Math.cos((lat * Math.PI) / 180);

    const createCrosshairGeoJSON = (gap: number) => {
      const lngGap = gap * lngCorrectionFactor;
      return {
        type: "FeatureCollection",
        features: [
          // North line
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [lng, lat + gap],
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
                [lng, lat - gap],
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
                [lng + lngGap, lat],
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
                [lng - lngGap, lat],
                [lng - LINE_EXTENT, lat],
              ],
            },
          },
        ],
      };
    };

    const currentZoom = maplibreMap.getZoom();
    const currentGap = getGapForZoom(currentZoom);
    const crosshairGeoJSON = createCrosshairGeoJSON(currentGap);

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
      const zoom = maplibreMap.getZoom();
      const gap = getGapForZoom(zoom);
      const newGeoJSON = createCrosshairGeoJSON(gap);

      const src = maplibreMap.getSource(CROSSHAIR_SOURCE);
      if (src) {
        src.setData(newGeoJSON);
      }
    };

    maplibreMap.on("zoom", updateCrosshair);

    return () => {
      maplibreMap.off("zoom", updateCrosshair);
      removeCrosshair();
    };
  }, [maplibreMap, selectedFeature, isCrossHairEnabled]);

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
          {isFollowMode && (
            <Control position="topleft" order={55}>
              <ControlButtonStyler
                onClick={fitToFeatures}
                title="Zur Übersicht"
              >
                <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
              </ControlButtonStyler>
            </Control>
          )}
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

            {/* Stadtbezirk vector overlay: sits in the `oneAboveBackgroundLayers`
                pane (z-index 105), i.e. directly above the basemap (z-index 100)
                and below the tree markers (additionalLayers0, z-index 250).
                Non-interactive backdrop, so selection stays off. */}
            <CismapLayer
              key="stadtbezirk-background"
              type="vector"
              style="https://tiles.cismet.de/stadtbezirk/simple.style.json"
              pane="oneAboveBackgroundLayers"
              selectionEnabled={false}
              opacity={0.5}
            />

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
                      // MapLibre serializes feature properties to strings when
                      // they come out of the vector pipeline; deserialize the
                      // ones the UI/edit flow expects as arrays.
                      if (typeof feature.properties.actions === "string") {
                        feature.properties.actions = JSON.parse(
                          feature.properties.actions
                        );
                      }
                      if (typeof feature.properties.kampagnen === "string") {
                        feature.properties.kampagnen = JSON.parse(
                          feature.properties.kampagnen
                        );
                      }

                      // add infoBoxControlObject
                      feature.properties.info = createInfoBoxControlObject(
                        feature,
                        setShowStatusDialog,
                        jwt
                      );
                      feature.text = feature.properties.info.puretitle;

                      // In follow mode: if feature is not visible, pan to it without changing zoom
                      if (
                        isFollowMode &&
                        routedMapRef?.leafletMap?.leafletElement
                      ) {
                        try {
                          const leafletMap =
                            routedMapRef.leafletMap.leafletElement;
                          const [lng, lat] = feature.geometry.coordinates;
                          const featureLatLng = [lat, lng] as [number, number];
                          const bounds = leafletMap.getBounds();

                          if (!bounds.contains(featureLatLng)) {
                            // Feature not visible - pan to center without changing zoom
                            leafletMap.panTo(featureLatLng);
                          }
                        } catch (error) {
                          console.error("Error panning to feature:", error);
                        }
                      }

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
