import L from "leaflet";
import proj4 from "proj4";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import { Button, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightFromBracket,
  faKey,
} from "@fortawesome/free-solid-svg-icons";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import {
  SelectionItem,
  TopicMapSelectionContent,
  useGazData,
  useMapHashRouting,
  useSelectionCesium,
  useSelectionTopicMap,
  useCesiumModels,
} from "@carma-appframeworks/portals";
import {
  geoElements,
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import type { FeatureInfo } from "@carma/types";
import { Measurements } from "@carma-commons/measurements";

import {
  useOverlayHelper,
  useOverlayTourContext,
} from "@carma-commons/ui/helper-overlay";
import { getApplicationVersion } from "@carma-commons/utils";

import {
  CustomViewer,
  selectShowPrimaryTileset,
  selectViewerModels,
  setCurrentSceneStyle,
  useCesiumContext,
  useCesiumInitialCameraFromSearchParams,
} from "@carma-mapping/engines/cesium";
import {
  useMapFrameworkSwitcherContext,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { useAuth } from "@carma-providers/auth";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { useHashState } from "@carma-providers/hash-state";

import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import { InfoBoxMeasurement } from "@carma-commons/measurements";
import PrintPreview from "../map-print/PrintPreview.tsx";

import versionData from "../../../version.json";

import { proj4crs3857def, proj4crs4326def } from "../../helper/gisHelper.js";
import { getBackgroundLayers } from "../../helper/layer.tsx";
import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";

import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useObliqueInitializer } from "../../oblique/hooks/useObliqueInitializer.ts";
import { useGeoportalFrameworkSwitcher } from "./controls/use-geoportal-framework-switcher.ts";

import { onClickTopicMap } from "./topicmap.utils.ts";
import { useCreateCismapLayers } from "./hooks/useCreateCismapLayer.ts";

import store from "../../store/index.ts";
import {
  getLoading,
  getSelectedFeature,
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../store/slices/features.ts";
import {
  getBackgroundLayer,
  getLayers,
  getLayersIdle,
  getShowHamburgerMenu,
  setLayersIdle,
} from "../../store/slices/mapping.ts";
import { getUIMode, UIMode } from "../../store/slices/ui.ts";

import LoginForm from "../LoginForm.tsx";
import { useModelSelectionDispatcher } from "../../hooks/useModelSelectionDispatcher.ts";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "../leaflet.css";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
}

const CLICK_DELAY_MS = 200;

export const GeoportalMap = ({ height, width, allow3d }: MapProps) => {
  const dispatch = useDispatch();

  // Contexts
  const {
    withTerrainProvider,
    withSurfaceProvider,
    getSurfaceProvider,
    getTerrainProvider,
    getScene,
    isValidViewer: isValidViewerCtx,
    isViewerReady,
  } = useCesiumContext();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const container2dMapRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);
  // Store MapLibre maps outside Redux to avoid serialization issues
  const maplibreMapsRef = useRef<Map<string, any>>(new Map());

  // State and Selectors
  const backgroundLayer = useSelector(getBackgroundLayer);
  const {
    //activeFramework: currentFramework, trigger re-renders on framework change
    // State values that trigger re-renders when framework changes
    isCesium,
    // Stable getters for hooks and callbacks
    getIsCesium,
    getIsLeaflet,
    getIsTransitioning, // Check if framework transition in progress
  } = useMapFrameworkSwitcherContext();

  const models = useSelector(selectViewerModels);
  const markerAsset = models[CESIUM_CONFIG.markerKey]; //
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;
  const layers = useSelector(getLayers);
  const maplibreMaps = layers
    .filter((l) => l.layerType === "vector" && l.visible)
    .map((l) => maplibreMapsRef.current.get(l.id));
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const selectedFeature = useSelector(getSelectedFeature);
  const loadingFeatureInfo = useSelector(getLoading);
  const { jwt, setJWT } = useAuth();

  const { getLeafletZoom } = useLeafletZoomControls();
  const showPrimaryTileset = useSelector(selectShowPrimaryTileset);

  const infoBoxOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("INFOBOX", geoElements),
    "350px",
    "137px"
  );

  const layerButtonsOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("LAYERBUTTONS", geoElements),
    "146px",
    "21px"
  );

  const mapInteractionOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("CENTER", geoElements),
    "15px",
    "15px"
  );

  useOverlayHelper(infoBoxOverlay);
  useOverlayHelper(layerButtonsOverlay);
  useOverlayHelper(mapInteractionOverlay);

  const {
    // routedMapRef --- NOT a REF!
    realRoutedMapRef: routedMapRef,
  } = useContext<typeof TopicMapContext>(TopicMapContext);

  const getLeafletMap = useCallback(
    () => routedMapRef.current?.leafletMap?.leafletElement,
    [routedMapRef]
  );

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey, showOverlayHandler } = useOverlayTourContext();

  const [isLoginFormVisible, setIsLoginFormVisible] = useState(false);
  const [marker, setMarker] = useState(undefined);
  const [markerAccent, setMarkerAccent] = useState(undefined);
  const [pos, setPos] = useState<[number, number] | null>(null);
  // TODO: move all these to a custom hook and collect all calls to updateFeatureInfo there
  const [shouldUpdateFeatureInfo, setShouldUpdateFeatureInfo] =
    useState<boolean>(false);
  const layersIdle = useSelector(getLayersIdle);

  const version = getApplicationVersion(versionData);

  // custom hooks
  const flags = useFeatureFlags();
  const { isDebugMode } = flags;
  const cesiumInitialCameraView = useCesiumInitialCameraFromSearchParams();

  // One-time gate: Cesium can only initialize once we have determined initial position
  // Once true, stays true forever (stored in ref to prevent re-renders)
  const cesiumCanInitializeRef = useRef(false);
  const cesiumInitialCameraViewRef =
    useRef<typeof cesiumInitialCameraView>(undefined);

  // Lock the gate once we have a valid initial position (from URL or will use config default)
  if (cesiumInitialCameraView !== null && !cesiumCanInitializeRef.current) {
    console.debug(
      "[CESIUM|INIT|GATE] Initial camera position determined, unlocking Cesium initialization"
    );
    cesiumCanInitializeRef.current = true;
    cesiumInitialCameraViewRef.current = cesiumInitialCameraView;
  }

  const { isObliqueMode } = useObliqueInitializer(isDebugMode);

  const updateLayersIdleState = useCallback(() => {
    if (layersIdle) {
      console.debug("Layers are idle, setting layers idle to false");
      dispatch(setLayersIdle(false));
    }
  }, [layersIdle, dispatch]);

  useDispatchSachdatenInfoText();
  const modelSelectionDispatcher = useModelSelectionDispatcher();

  const useCesiumModelOptions = useMemo(() => {
    return {
      models: CESIUM_CONFIG.models || [],
      enabled: flags.featureFlagBugaBridge && isCesium,
      selection: {
        enabled: flags.featureFlagBugaBridge && isCesium,
        deselectOnEmptyClick: true,
        onSelect: (feature) =>
          modelSelectionDispatcher(feature as FeatureInfo | null),
      },
    };
  }, [flags.featureFlagBugaBridge, isCesium, modelSelectionDispatcher]);
  useCesiumModels(useCesiumModelOptions);

  const routingOptions = useMemo(
    () => ({
      getLeafletMap,
      getLeafletZoom,
      labels: {
        clearCesium: "GPM:2D:clearCesium",
        writeLeafletLike: "GPM:2D:writeLocation",
        topicMapLocation: "GPM:TopicMap:locationChangedHandler",
        cesiumScene: "GPM:3D",
      },
    }),
    [getLeafletMap, getLeafletZoom]
  );

  const { handleTopicMapLocationChange, handleCesiumSceneChange } =
    useMapHashRouting(routingOptions);

  // Map framework switcher (2D ↔ 3D transitions)
  // Register maps with context for framework switching
  // Only register when both maps are actually initialized (not null)
  const leafletMap = getLeafletMap();
  const cesiumScene = getScene();
  const cesiumContainer = container3dMapRef.current;
  const terrainProvider = getTerrainProvider();
  const surfaceProvider = getSurfaceProvider();

  const frameworkOptions = useMemo(() => {
    // Gate: Only register when both frameworks have initialized
    // Prevents registering null values that would keep the switcher disabled
    if (
      !leafletMap ||
      !cesiumScene ||
      !cesiumContainer ||
      !isViewerReady ||
      !routedMapRef.current
    ) {
      return null;
    }

    return {
      leafletMap,
      cesiumScene,
      cesiumContainer,
      terrainProviders: {
        TERRAIN: terrainProvider ?? null,
        SURFACE: surfaceProvider ?? null,
      },
      // When useBrowserRecommendedResolution: false, Cesium renders at device pixels
      // but reports resolutionScale = 1.0. For transition calculations, we need the
      // actual device pixel ratio to correctly calculate zoom/distance equivalence.
      resolutionScale: window.devicePixelRatio,
    };
  }, [
    leafletMap,
    cesiumScene,
    cesiumContainer,
    terrainProvider,
    surfaceProvider,
    isViewerReady,
    routedMapRef,
  ]);

  useRegisterMapFramework(frameworkOptions);

  // Register geoportal-specific framework switcher callbacks
  useGeoportalFrameworkSwitcher();

  const { gazData } = useGazData();

  useFeatureInfoModeCursorStyle();

  const onComplete = useCallback(
    (selection: SelectionItem) => {
      if (layers.filter((l) => l.layerType === "vector").length === 0) return;
      // Note: This callback is only called from useSelectionTopicMap for Leaflet selections
      // No need to check getIsLeaflet() here - it's redundant and causes stale closure issues
      if (
        (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
        !isAreaType(selection.type as ENDPOINT)
      ) {
        const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
          selection.x,
          selection.y,
        ]);
        const leaflet = getLeafletMap();

        if (!leaflet) {
          console.debug(
            "[GAZETTEER-SELECTION] No leaflet map available, retrying..."
          );
          setTimeout(() => {
            onComplete(selection);
          }, 20);
          return;
        }

        // builtInGazetteerHitTrigger moves the map and loads layers before calling this
        // We need to delay the virtual click to ensure layers have rendered
        console.debug(
          "[GAZETTEER-SELECTION] Scheduling virtual click after delay..."
        );
        setTimeout(() => {
          const updatedPos = { lat: selectedPos[1], lng: selectedPos[0] };
          const latlngPoint = L.latLng(updatedPos);

          console.debug(
            "[GAZETTEER-SELECTION] Firing virtual click",
            updatedPos
          );
          leaflet.fireEvent("click", {
            latlng: latlngPoint,
            layerPoint: leaflet.latLngToLayerPoint(latlngPoint),
            containerPoint: leaflet.latLngToContainerPoint(latlngPoint),
          });
        }, CLICK_DELAY_MS);
      }
    },
    [layers, uiMode, getLeafletMap]
  );

  const updateFeatureInfoLeaflet = useCallback(() => {
    setShouldUpdateFeatureInfo(false);
    if (!pos) return;

    setTimeout(() => {
      const latlngPoint = L.latLng(pos);
      const leaflet = getLeafletMap();
      leaflet &&
        leaflet.fireEvent("click", {
          latlng: latlngPoint,
          layerPoint: leaflet.latLngToLayerPoint(latlngPoint),
          containerPoint: leaflet.latLngToContainerPoint(latlngPoint),
        });
    }, 150);
  }, [pos, getLeafletMap]);

  const selectionCesiumOptions = useMemo(
    () => ({
      markerAsset,
      markerAnchorHeight,
      isPrimaryStyle: showPrimaryTileset,
      withTerrainProvider,
      withSurfaceProvider,
    }),
    [
      markerAsset,
      markerAnchorHeight,
      showPrimaryTileset,
      withTerrainProvider,
      withSurfaceProvider,
    ]
  );

  const selectionTopicMapOptions = useMemo(
    () => ({
      onComplete,
    }),
    [onComplete]
  );

  useSelectionTopicMap(selectionTopicMapOptions);
  useSelectionCesium(getIsCesium, selectionCesiumOptions, isObliqueMode);

  useEffect(() => {
    let layerType = "";

    if (layers.length === 0) {
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      dispatch(setSelectedFeature(null));
    }

    layers.forEach((layer, i) => {
      if (i === 0) {
        layerType = layer.layerType;
      }
    });
  }, [layers]);

  useEffect(() => {
    // TODO wrap this with 3d component in own component?
    // INTIALIZE Cesium Tileset style from Geoportal/TopicMap background later style
    if (isValidViewerCtx() && backgroundLayer) {
      if (backgroundLayer.id === "luftbild") {
        dispatch(setCurrentSceneStyle("primary"));
      } else {
        dispatch(setCurrentSceneStyle("secondary"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);

  useEffect(() => {
    const leaflet = getLeafletMap();
    if (uiMode !== UIMode.FEATURE_INFO && marker !== undefined && leaflet) {
      leaflet.removeLayer(marker);
      leaflet.removeLayer(markerAccent);
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      setPos(null);
      dispatch(setPreferredLayerId(""));
    }
  }, [uiMode, getLeafletMap, marker, markerAccent, dispatch]);

  useEffect(() => {
    if (isModeFeatureInfo && pos) updateFeatureInfoLeaflet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  useEffect(() => {
    const leaflet = getLeafletMap();

    const handleZoomEnd = () => {
      setShouldUpdateFeatureInfo(true);
    };

    leaflet && leaflet.on("zoomend", handleZoomEnd);

    // Clean up the event listener when the component unmounts
    return () => {
      leaflet && leaflet.off("zoomend", handleZoomEnd);
    };
  }, [getLeafletMap]);

  const renderInfoBox = useCallback(() => {
    if (getIsLeaflet()) {
      if (isModeMeasurement) {
        return <InfoBoxMeasurement key={uiMode} />;
      }
      if (selectedFeature || loadingFeatureInfo) {
        return <FeatureInfoBox pos={pos} />;
      }
    } else if (
      getIsCesium() &&
      flags.featureFlagBugaBridge &&
      selectedFeature
    ) {
      // TODO unify with point queries for position information?
      return <FeatureInfoBox />;
    }

    return <div></div>;
  }, [
    getIsLeaflet,
    getIsCesium,
    isModeMeasurement,
    uiMode,
    selectedFeature,
    loadingFeatureInfo,
    pos,
    flags.featureFlagBugaBridge,
  ]);

  const showOverlayFromOutside = useCallback(
    (key: string) => {
      setAppMenuVisible(false);
      setSecondaryWithKey(key);
      showOverlayHandler();
    },
    [setAppMenuVisible, setSecondaryWithKey, showOverlayHandler]
  );

  useEffect(() => {
    if (shouldUpdateFeatureInfo) updateFeatureInfoLeaflet();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldUpdateFeatureInfo]);

  const topicMapLocationChangedHandler = useCallback(
    (p: { lat: number; lng: number; zoom: number }) => {
      // During transitions, don't update hash - let transition handle it
      // This prevents TopicMapContextProvider from reading and re-applying the hash
      if (getIsTransitioning()) {
        return;
      }
      if (!getIsLeaflet()) {
        return;
      }
      handleTopicMapLocationChange(p);
      updateLayersIdleState();
    },
    [
      getIsLeaflet,
      getIsTransitioning,
      handleTopicMapLocationChange,
      updateLayersIdleState,
    ]
  );

  const containerStyle: CSSProperties = useMemo(
    () => ({
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 400,
      // CSS transition managed by useMapFrameworkSwitcher hook
    }),
    []
  );

  const onSceneChange = useCallback(
    (e: { hashParams: Record<string, string> }) => {
      if (getIsLeaflet()) {
        console.debug(
          "[CESIUM|DEBUG|CESIUM_WARN] Cesium scene change triggered while in Leaflet mode"
        );
        return;
      }
      handleCesiumSceneChange(e);
    },
    [getIsLeaflet, handleCesiumSceneChange]
  );

  const createLayerOptions = useMemo(
    () => ({
      mode: uiMode,
      dispatch,
      zoom: getLeafletZoom(),
      selectedFeature,
      leafletMap: getLeafletMap(),
      maplibreMapsRef,
    }),
    [
      uiMode,
      dispatch,
      getLeafletZoom,
      selectedFeature,
      getLeafletMap,
      maplibreMapsRef,
    ]
  );

  // TODO Move out Controls to own component

  console.debug(
    "RENDER: [GEOPORTAL] MAP",
    rerenderCountRef.current,
    lastRenderIntervalRef.current
  );
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  return (
    <>
      <div className={"map-container-2d"} style={{ zIndex: 400 }}>
        <TopicMapComponent
          gazData={gazData}
          modalMenu={
            <GenericModalApplicationMenu
              {...getCollabedHelpComponentConfig({
                versionString: version,
                showOverlayFromOutside,
                loginFormToggle: () =>
                  setIsLoginFormVisible(!isLoginFormVisible),
                isLoginFormVisible,
                loginForm: (
                  <LoginForm
                    onSuccess={() => {
                      setIsLoginFormVisible(false);
                      setAppMenuVisible(false);
                    }}
                    closeLoginForm={() => setIsLoginFormVisible(false)}
                  />
                ),
                loginFormTrigger: (
                  <Tooltip
                    title={jwt ? "Abmeldung" : "Anmeldung"}
                    zIndex={99999999}
                  >
                    <Button
                      type="text"
                      onClick={() =>
                        jwt
                          ? setJWT(null)
                          : setIsLoginFormVisible(!isLoginFormVisible)
                      }
                    >
                      <FontAwesomeIcon
                        icon={jwt ? faArrowRightFromBracket : faKey}
                        size="lg"
                      />
                    </Button>
                  </Tooltip>
                ),
              })}
            />
          }
          gazetteerSearchComponent={EmptySearchComponent}
          applicationMenuTooltipString={tooltipText}
          hamburgerMenu={showHamburgerMenu}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          mapStyle={{
            width,
            height,
            touchAction: "none",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
          }}
          leafletMapProps={{ editable: true }}
          minZoom={10}
          backgroundlayers="empty"
          mappingBoundsChanged={() => {
            // intentionally no-op
          }}
          locationChangedHandler={topicMapLocationChangedHandler}
          outerLocationChangedHandlerExclusive={true}
          onclick={(e) => {
            const map = getLeafletMap();
            if (!map) return;

            if (uiMode === UIMode.FEATURE_INFO) {
              if (marker !== undefined) {
                map.removeLayer(marker);
              }
              if (markerAccent !== undefined) {
                map.removeLayer(markerAccent);
              }

              map.getPane(
                "markerPaneWithBlendModeDifference"
              ).style.zIndex = 601;
              setMarkerAccent(
                L.marker([e.latlng.lat, e.latlng.lng], {
                  // pane: "backgroundlayerTooltips",
                  icon: L.divIcon({
                    className: "custom-marker", // Optional class for external styles
                    html: `
                          <div style="
                            position: relative;
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            opacity: 1;
                          ">
                            <div style="
                              position: absolute;
                              width: 20px;
                              height: 20px;
                              border: 2px solid black;
                              border-radius: 50%;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 20000px;
                              height: 1px;
                              background-color: black;
                              right: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 20000px;
                              height: 1px;
                              background-color: black;
                              left: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 1px;
                              height: 20000px;
                              background-color: black;
                              top: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 1px;
                              height: 20000px;
                              background-color: black;
                              bottom: 18px;
                              opacity: 0.5;
                            "></div>
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
                    className: "custom-marker", // Optional class for external styles
                    html: `
                          <div style="
                            position: relative;
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          ">
                             <div style="
                              position: absolute;
                              width: 6px;
                              height: 6px;
                              background-color: yellow;
                              border-radius: 50%;
                            ">
                          </div>
                        `,
                    iconSize: [30, 30],
                  }),
                }).addTo(map)
              );

              setPos([e.latlng.lat, e.latlng.lng]);
            }
            onClickTopicMap(e, {
              dispatch,
              mode: uiMode,
              store,
              zoom: getLeafletZoom(),
              map: map,
            });
          }}
          gazetteerSearchControl={true}
          infoBox={renderInfoBox()}
          zoomSnap={LEAFLET_CONFIG.zoomSnap}
          zoomDelta={LEAFLET_CONFIG.zoomDelta}
        >
          <TopicMapSelectionContent />
          {backgroundLayer &&
            backgroundLayer.visible &&
            getBackgroundLayers({
              layerString: backgroundLayer.layers,
              masterOpacity: backgroundLayer.opacity,
            })}

          {useCreateCismapLayers(layers, createLayerOptions)}
          <PrintPreview />
          <Measurements snappingLayers={maplibreMaps} />
        </TopicMapComponent>
      </div>
      {allow3d && cesiumCanInitializeRef.current && (
        <div
          ref={container3dMapRef}
          className={"map-container-3d"}
          style={containerStyle}
        >
          <CustomViewer
            containerRef={container3dMapRef}
            cameraLimiterOptions={CESIUM_CONFIG.camera}
            initialCameraView={cesiumInitialCameraViewRef.current ?? undefined}
            onSceneChange={onSceneChange}
          />
        </div>
      )}
    </>
  );
};

export default GeoportalMap;
