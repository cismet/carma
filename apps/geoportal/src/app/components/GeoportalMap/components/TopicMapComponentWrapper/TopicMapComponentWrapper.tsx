import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import L from "leaflet";
import { useDispatch, useSelector } from "react-redux";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";

import {
  SelectionItem,
  TopicMapSelectionContent,
  useGazData,
  useSelectionTopicMap,
  usePortalContext,
} from "@carma-appframeworks/portals";

import { tooltipText } from "@carma-collab/wuppertal/geoportal";
import { isAreaType } from "@carma/resources";
import { getApplicationVersion } from "@carma-commons/utils";
import { useOverlayTourContext } from "@carma-commons/ui/helper-overlay";
import { InfoBoxMeasurement } from "@carma-commons/measurements";

import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { useFeatureFlags } from "@carma/providers/feature-flag";

import PrintPreview from "../../../map-print/PrintPreview.tsx";
import FeatureInfoBox from "../../../feature-info/FeatureInfoBox.tsx";

import versionData from "../../../../../version.json";

import { getFromWebMercatorToWGS84 } from "@carma/geo/proj";
import { useLeafletZoomControls } from "@carma-mapping/engines/leaflet";
import { useDispatchSachdatenInfoText } from "../../../../hooks/useDispatchSachdatenInfoText.ts";
import { UIMode, getUIMode } from "../../../../store/slices/ui.ts";
import { useModalMenu } from "./hooks/useModalMenu";
import {
  getLayers,
  getLayersIdle,
  getBackgroundLayer,
  getShowHamburgerMenu,
  setLayersIdle,
} from "../../../../store/slices/mapping.ts";
import {
  getLoading,
  getSelectedFeature,
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../../../store/slices/features.ts";
import {
  getPrintError,
  changePrintError,
} from "../../../../store/slices/print.ts";
import { getBackgroundLayers } from "../../../../helper/layer.tsx";
import { useCreateCismapLayers } from "./hooks/useCreateCismapLayer.ts";
import { useTopicMapLocationChangedHandler } from "./hooks/useTopicMapLocationChangedHandler.ts";
import store from "../../../../store/index.ts";
import { onClickTopicMap } from "../../topicmap.utils.ts";
import {
  useCleanupFeatureInfoOnModeChange,
  useLeafletZoomEndFlag,
  useUpdateFeatureInfoOnFlag,
  useUpdateFeatureInfoOnLayersChange,
} from "./hooks/useFeatureInfoLifecycle.ts";

type TopicMapComponentWrapperProps = {
  height: number;
  width: number;
};

const noop = () => {};

/**
 * ESSENTIAL PORTAL WRAPPER for 2D Leaflet map instance setup
 *
 * This component is essential for setting up the Leaflet map instance within the portal architecture.
 * It reads initial state from PortalContext refs (guaranteed by portal gating) and configures the TopicMap.
 *
 * NOTE: Currently in apps/geoportal due to Redux integrations, but should eventually move to @carma-appframeworks/portals
 * alongside CesiumMapComponentWrapper for consistency.
 */
export const TopicMapComponentWrapper = ({
  height,
  width,
}: TopicMapComponentWrapperProps) => {
  const dispatch = useDispatch();
  const { portalConfig, updateEngine, getEngines, passedGate, getView, getHomeView } = usePortalContext();
  const { zoomSnap, zoomDelta } = portalConfig.leaflet;

  // Get CarmaTopicMapContext for MapView data
  const carmaTopicMapContext = useCarmaTopicMapContext();

  // Redux selectors - log to track if they're causing re-renders
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const layersIdle = useSelector(getLayersIdle);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const selectedFeature = useSelector(getSelectedFeature);
  const loadingFeatureInfo = useSelector(getLoading);
  const printError = useSelector(getPrintError);
  const flags = useFeatureFlags();

  // Log Redux state changes to identify re-render causes
  console.log("[TopicMapComponentWrapper] Redux state:", {
    uiMode,
    layersCount: layers?.length,
    layersIdle,
    backgroundLayerVisible: backgroundLayer?.visible,
    showHamburgerMenu,
    hasSelectedFeature: !!selectedFeature,
    loadingFeatureInfo,
    hasPrintError: !!printError,
    flagsCount: Object.keys(flags).length,
  });

  const { isSuspendedRef, leafletMapRef } = useCarmaTopicMapContext();
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey, showOverlayHandler } = useOverlayTourContext();
  const version = getApplicationVersion(versionData);
  const { getLeafletZoom } = useLeafletZoomControls(leafletMapRef);
  const { gazData } = useGazData();

  const getTopicMap = useCallback(() => leafletMapRef.current, []); // leafletMapRef is stable ref from context

  const lastSelectionRef = useRef<number | null>(null);
  const pendingSelectionRef = useRef<{ lat: number; lng: number } | null>(null);

  // Handle print error timeout - clear error after 5 seconds
  useEffect(() => {
    if (printError) {
      const timer = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatch(changePrintError(null as any));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [printError, dispatch]);

  const updateLayersIdleState = () => {
    if (layersIdle) {
      dispatch(setLayersIdle(false));
    }
  };

  const topicMapLocationChangedHandler = useTopicMapLocationChangedHandler(
    updateLayersIdleState
  );

  // Update Sachdaten info text based on layers and zoom
  useDispatchSachdatenInfoText();

  const [marker, setMarker] = useState<L.Marker | undefined>();
  const [markerAccent, setMarkerAccent] = useState<L.Marker | undefined>();
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [shouldUpdateFeatureInfo, setShouldUpdateFeatureInfo] =
    useState<boolean>(false);

  const handleOnClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const map = getTopicMap();
      if (!map) return;

      if (uiMode === UIMode.FEATURE_INFO) {
        if (marker) map.removeLayer(marker);
        if (markerAccent) map.removeLayer(markerAccent);

        map.getPane("markerPaneWithBlendModeDifference").style.zIndex = "601";
        setMarkerAccent(
          L.marker([e.latlng.lat, e.latlng.lng], {
            icon: L.divIcon({
              className: "custom-marker",
              html: `
                <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 1;">
                  <div style="position: absolute; width: 20px; height: 20px; border: 2px solid black; border-radius: 50%;"></div>
                  <div style="position: absolute; width: 20000px; height: 1px; background-color: black; right: 18px; opacity: 0.5;"></div>
                  <div style="position: absolute; width: 20000px; height: 1px; background-color: black; left: 18px; opacity: 0.5;"></div>
                  <div style="position: absolute; width: 1px; height: 20000px; background-color: black; top: 18px; opacity: 0.5;"></div>
                  <div style="position: absolute; width: 1px; height: 20000px; background-color: black; bottom: 18px; opacity: 0.5;"></div>
                </div>
              `,
              iconSize: [30, 30],
            }),
          }).addTo(map)
        );
        setMarker(
          L.marker([e.latlng.lat, e.latlng.lng], {
            pane: "markerPaneWithBlendModeDifference",
            icon: L.divIcon({
              className: "custom-marker",
              html: `
                <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                  <div style="position: absolute; width: 6px; height: 6px; background-color: yellow; border-radius: 50%;"></div>
                </div>
              `,
              iconSize: [30, 30],
            }),
          }).addTo(map)
        );

        setPos([e.latlng.lat, e.latlng.lng]);
      } else if (uiMode === UIMode.DEFAULT) {
        // Clear feature info when clicking map in default mode
        dispatch(setSelectedFeature(null));
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([]));
      }

      onClickTopicMap(e, {
        dispatch,
        mode: uiMode,
        store,
        zoom: getLeafletZoom() ?? 15, // Fallback zoom if map not ready
        map,
      });
    },
    [uiMode, marker, markerAccent, getTopicMap, getLeafletZoom, dispatch, store]
  );

  const onComplete = useCallback(
    (selection: SelectionItem) => {
      console.log("[TopicMapComponentWrapper] onComplete called with:", selection);
      // Removed duplicate check to allow re-selecting same gazetteer item
      // if (lastSelectionRef.current === selection.sorter) {
      //   console.log("[TopicMapComponentWrapper] Skipping duplicate selection");
      //   return;
      // }
      lastSelectionRef.current = selection.sorter;

      if (layers.filter((l) => l.layerType === "vector").length === 0) {
        console.log("[TopicMapComponentWrapper] No vector layers, skipping");
        return;
      }
      if (
        !isAreaType(selection.type) &&
        !isSuspendedRef.current
      ) {
        console.log("[TopicMapComponentWrapper] Processing selection, layersIdle:", layersIdle);
        // Convert from Web Mercator (EPSG:3857) to WGS84 (EPSG:4326)
        const [lng, lat] = getFromWebMercatorToWGS84([
          selection.x,
          selection.y,
        ]);

        if (layersIdle) {
          console.log("[TopicMapComponentWrapper] Layers idle, firing click event at:", lat, lng);
          const map = getTopicMap();
          const latlngPoint = L.latLng({ lat, lng });
          if (map) {
            // Add delay to allow builtInGazetteerHitTrigger to complete map pan
            setTimeout(() => {
              const evt = {
                latlng: latlngPoint,
                layerPoint: map.latLngToLayerPoint(latlngPoint),
                containerPoint: map.latLngToContainerPoint(latlngPoint),
              } as unknown as L.LeafletMouseEvent;
              map.fireEvent("click", evt);
              console.log("[TopicMapComponentWrapper] Click event fired after delay");
            }, 500); // Wait 500ms for map pan to complete
          }
          pendingSelectionRef.current = null; // Clear pending
        } else {
          console.log("[TopicMapComponentWrapper] Layers not idle, storing pending selection");
          // Store coordinates to process when layers become idle
          pendingSelectionRef.current = { lat, lng };
        }
      } else {
        console.log("[TopicMapComponentWrapper] Selection skipped - area type:", isAreaType(selection.type), "suspended:", isSuspendedRef.current);
      }
    },
    [layers, isSuspendedRef, layersIdle, getTopicMap]
  );

  // Process pending selection when layers become idle
  useEffect(() => {
    if (layersIdle && pendingSelectionRef.current) {
      const pending = pendingSelectionRef.current;
      pendingSelectionRef.current = null;

      const map = getTopicMap();
      const latlngPoint = L.latLng({ lat: pending.lat, lng: pending.lng });
      if (map) {
        const evt = {
          latlng: latlngPoint,
          layerPoint: map.latLngToLayerPoint(latlngPoint),
          containerPoint: map.latLngToContainerPoint(latlngPoint),
        } as unknown as L.LeafletMouseEvent;
        map.fireEvent("click", evt);
      }
    }
  }, [layersIdle, getTopicMap]);

  const selectionTopicMapOptions = useMemo(
    () => ({ onComplete }),
    [onComplete]
  );

  useSelectionTopicMap(selectionTopicMapOptions);

  const updateFeatureInfoLeaflet = useCallback(() => {
    setShouldUpdateFeatureInfo(false);
    if (!pos) return;

    setTimeout(() => {
      const latlngPoint = L.latLng(pos);
      const map = getTopicMap();
      if (map) {
        const evt = {
          latlng: latlngPoint,
          layerPoint: map.latLngToLayerPoint(latlngPoint),
          containerPoint: map.latLngToContainerPoint(latlngPoint),
        } as unknown as L.LeafletMouseEvent;
        map.fireEvent("click", evt);
      }
    }, 150);
  }, [pos, getTopicMap]);

  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;

  // Feature info lifecycle hooks
  useUpdateFeatureInfoOnLayersChange(
    isModeFeatureInfo,
    pos,
    layers,
    updateFeatureInfoLeaflet
  );

  useUpdateFeatureInfoOnFlag(shouldUpdateFeatureInfo, updateFeatureInfoLeaflet);

  const onCleanup = useCallback(() => {
    dispatch(setSelectedFeature(null));
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(setFeatures([]));
    setPos(null);
    dispatch(setPreferredLayerId(""));
  }, [dispatch]);

  useCleanupFeatureInfoOnModeChange({
    shouldCleanup: uiMode !== UIMode.FEATURE_INFO,
    getTopicMap,
    marker,
    markerAccent,
    onCleanup,
  });

  const layerOptions = useMemo(() => {
    return {
      mode: uiMode,
      dispatch,
      selectedFeature,
      leafletMap: getTopicMap(),
    };
  }, [uiMode, dispatch, selectedFeature, getTopicMap]);

  const topicMapLayersElement = useCreateCismapLayers(layers, layerOptions);

  const backgroundLayerElement = useMemo(() => {
    return (
      backgroundLayer &&
      backgroundLayer.visible &&
      getBackgroundLayers({
        layerString: backgroundLayer.layers,
        masterOpacity: backgroundLayer.opacity,
      })
    );
  }, [backgroundLayer]);

  const showOverlayFromOutside = useCallback(
    (key: string) => {
      setAppMenuVisible(false);
      setSecondaryWithKey(key);
      showOverlayHandler();
    },
    [setAppMenuVisible, setSecondaryWithKey, showOverlayHandler]
  );

  const modalMenu = useModalMenu({ version, showOverlayFromOutside });

  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const mapStyle = useMemo(
    () => ({
      width: width,
      height: height,
      touchAction: "none",
      WebkitOverflowScrolling: "touch",
      overscrollBehavior: "none",
    }),
    [width, height]
  );
  const leafletMapProps = useMemo(() => ({ editable: true }), []);
  const infoBox = useMemo(() => {
    if (!isSuspendedRef.current) {
      if (isModeMeasurement) return <InfoBoxMeasurement key={uiMode} />;
      if (selectedFeature || loadingFeatureInfo)
        return <FeatureInfoBox pos={pos ?? undefined} />;
    } else if (flags.featureFlagBugaBridge && selectedFeature) {
      return <FeatureInfoBox />;
    }
    return <div></div>;
  }, [
    isModeMeasurement,
    selectedFeature,
    loadingFeatureInfo,
    pos,
    flags.featureFlagBugaBridge,
    uiMode,
    isSuspendedRef,
  ]);

  useLeafletZoomEndFlag(getTopicMap, setShouldUpdateFeatureInfo);

  console.debug("RENDER [GEOPORTAL|TOPICMAP]");

  // Get initial position from PortalContext view (set by getInitialPortalState)
  // Portal gating guarantees this is available when passedGate is true
  const view = getView();
  
  if (!passedGate || !view) {
    console.error(
      "[TopicMapComponentWrapper] CRITICAL: Portal gate not passed or view is null. " +
        "This indicates a portal initialization bug.",
      { passedGate, view }
    );
    throw new Error("Portal initialization failed: gate not passed or view not set");
  }

  const { center, zoom } = view;

  // Function to update the Leaflet engine record
  const updateLeafletEngineRecord = useCallback(() => {
    // Get current engines to check if leaflet2d is ready
    const engines = getEngines();
    const leafletEngine = engines.find(
      (engine) => engine.engine === "leaflet2d"
    );

    if (leafletEngine && !leafletEngine.isReady) {
      console.log(
        "[TopicMapComponentWrapper] Marking Leaflet engine as ready"
      );

      // Get the actual Leaflet map instance
      const leafletMap = carmaTopicMapContext.leafletMapRef.current;

      if (!leafletMap) {
        console.error(
          "[TopicMapComponentWrapper] Leaflet map instance not available"
        );
        return;
      }

      // Update the engine using the controlled updater function
      updateEngine("leaflet2d", {
        isReady: true,
        isSuspended: false, // Start active in 2D mode (managed by TransitionContext during mode switches)
        instance: () => leafletMap, // Store getter function for fresh access
        getPixelRatio: () => window.devicePixelRatio,
        zoomOut: (onComplete?: () => void) => {
          console.debug("[TopicMapComponentWrapper] Engine zoomOut called");
          leafletMap.zoomOut();
          onComplete?.();
        },
        zoomIn: (onComplete?: () => void) => {
          console.debug("[TopicMapComponentWrapper] Engine zoomIn called");
          leafletMap.zoomIn();
          onComplete?.();
        },
        flyHome: (onComplete?: () => void) => {
          console.debug("[TopicMapComponentWrapper] Engine flyHome called");
          const homeView = getHomeView();

          if (!homeView) {
            console.warn("[TopicMapComponentWrapper] No home view available");
            onComplete?.();
            return;
          }

          console.debug("[TopicMapComponentWrapper] Flying to home:", homeView);

          const handleMoveEnd = () => {
            console.debug("[TopicMapComponentWrapper] flyHome moveend fired");
            leafletMap.off("moveend", handleMoveEnd);
            onComplete?.();
          };

          leafletMap.on("moveend", handleMoveEnd);
          leafletMap.flyTo(homeView.center, homeView.zoom, {
            animate: true,
            duration: 2,
          });
        },
        setStyle: (style: string) => {
          console.debug(
            "[TopicMapComponentWrapper] Engine setStyle called with:",
            style
          );
          // TODO: Implement style switching for Leaflet
        },
        setCamera: (camera: any) => {
          console.debug(
            "[TopicMapComponentWrapper] Engine setCamera called with:",
            camera
          );
          // TODO: Implement camera setting for Leaflet (convert to MapView)
        },
        debug: {
          config: portalConfig.leaflet,
          timestamp: Date.now(),
        },
      });
    }
  }, [carmaTopicMapContext, updateEngine, portalConfig.leaflet, getEngines]);

  // Register callback for when the Leaflet map is ready
  useEffect(() => {
    console.debug("[TopicMapComponentWrapper] Registering map ready callback");

    // Register callback to be notified when map is ready
    carmaTopicMapContext.onMapViewUpdate(() => {
      console.debug(
        "[TopicMapComponentWrapper] MapView update received, checking if map is ready"
      );

      // Update engine record when map is ready
      updateLeafletEngineRecord();
    });

    // Also check if map is already available and update engine record
    if (carmaTopicMapContext.leafletMapRef.current) {
      console.debug(
        "[TopicMapComponentWrapper] Leaflet map already available, updating engine record"
      );
      updateLeafletEngineRecord();
    }
  }, [carmaTopicMapContext, updateLeafletEngineRecord]);

  return (
    <div className={"map-container-2d"} style={{ zIndex: 400 }}>
      <TopicMapComponent
        gazData={gazData}
        modalMenu={modalMenu}
        gazetteerSearchComponent={EmptySearchComponent}
        applicationMenuTooltipString={tooltipText}
        hamburgerMenu={showHamburgerMenu}
        locatorControl={false}
        fullScreenControl={false}
        zoomControls={false}
        mapStyle={mapStyle}
        leafletMapProps={leafletMapProps}
        minZoom={10}
        backgroundlayers="empty"
        mappingBoundsChanged={noop} // intentionally empty
        locationChangedHandler={topicMapLocationChangedHandler}
        outerLocationChangedHandlerExclusive={true}
        //disableUseLocation={true}
        onclick={handleOnClick}
        gazetteerSearchControl={true}
        infoBox={infoBox}
        zoomSnap={zoomSnap}
        zoomDelta={zoomDelta}
        fallbackPosition={center}
        fallbackZoom={zoom}
      >
        <TopicMapSelectionContent />
        {backgroundLayerElement}
        {topicMapLayersElement}
        <PrintPreview />
      </TopicMapComponent>
    </div>
  );
};

export default TopicMapComponentWrapper;
