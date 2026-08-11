import L from "leaflet";
import { getFromWebMercatorToWGS84 } from "@carma-geo/proj";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Map as LeafletMap } from "leaflet";

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
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import {
  geoElements,
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { Measurements, InfoBoxMeasurement } from "@carma-commons/measurements";

import {
  useOverlayHelper,
  useOverlayTourContext,
} from "@carma-commons/ui/helper-overlay";
import { getApplicationVersion } from "@carma-commons/utils";

import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";
import { useMaplibreRuntimeBridge } from "@carma-mapping/engines-interop/view-state";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";
import { useAuth } from "@carma-providers/auth";
import { useLibreMapEnabled } from "../../hooks/useLibreMapEnabled";
import { getLayers as getBackgroundLayers } from "@carma-appframeworks/portals";
import { CarmaMap } from "@carma-mapping/core";
import { useLibreContext } from "@carma-mapping/contexts";
import {
  MeasurementHost,
  MeasurementInfoBox,
  useMeasurements,
} from "@carma-mapping/measurements";

import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import PrintPreview from "../map-print/PrintPreview.tsx";
import LibrePrintPreview from "../map-print/LibrePrintPreview.tsx";

import versionData from "../../../version.json";

import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";

import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useGeoportalInitialValues } from "../../hooks/useGeoportalInitialValues.ts";
import useLibreLayers from "../../hooks/libre/useLibreLayers.ts";
import { useMaplibreTransitionShim } from "../../hooks/libre/useMaplibreTransitionShim.ts";
import { useLibreMapSelectionHandler } from "../../hooks/libre/useLibreMapClickHandler.ts";
import { useLibreTriggerSelectionSync } from "../../hooks/libre/useLibreTriggerSelectionSync.ts";

import { onClickTopicMap } from "./topicmap.utils.ts";
import { useCreateCismapLayers } from "./hooks/useCreateCismapLayer.ts";
import {
  GeoportalCesiumHost,
  useGeoportalCesium,
  useGeoportalCesiumInfoBox,
} from "./cesium/index.ts";

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
  setMaplibreMaps as setMaplibreMapsStore,
} from "../../store/slices/mapping.ts";
import {
  getUIMode,
  UIMode,
  getTriggerFeatureInfoUpdate,
  getUIMapInteractionEnabled,
  getUIHashWriteEnabled,
  getUIVisibleControls,
} from "../../store/slices/ui.ts";
import { findFachzwillingByPathname } from "../../constants/fachzwillinge";
import { getLibreDrawMode } from "../../store/slices/measurements.ts";

import LoginForm from "../LoginForm.tsx";

import { LEAFLET_CONFIG, RESTRICT_LIBRE_CAMERA } from "../../config/app.config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "../leaflet.css";
import AdhocSelectionSync from "../feature-info/AdhocSelectionSync.tsx";
import { selectionPadding } from "../../constants/selection.ts";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
}

const CLICK_DELAY_MS = 200;

// position-based help entries shared by the leaflet and maplibre map variants
const useGeoportalHelpOverlays = () => {
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
};

const LeafletGeoportalMap = ({ height, width, allow3d }: MapProps) => {
  const dispatch = useDispatch();

  // Contexts
  const { initialViewApplied } = useCesiumContext();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  // Store MapLibre maps outside Redux to avoid serialization issues
  const maplibreMapsRef = useRef<Map<string, MaplibreMap>>(new Map());
  const selectionSemanticIdentifierRef = useRef<string | undefined>(undefined);

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

  const layers = useSelector(getLayers);
  const [maplibreMaps, setMaplibreMaps] = useState<MaplibreMap[]>([]);
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const selectedFeature = useSelector(getSelectedFeature);
  const loadingFeatureInfo = useSelector(getLoading);

  const { getLeafletZoom } = useLeafletZoomControls();

  useGeoportalHelpOverlays();

  const {
    // routedMapRef --- NOT a REF!
    realRoutedMapRef: routedMapRef,
  } = useContext<typeof TopicMapContext>(TopicMapContext);

  const getLeafletMap = useCallback(
    () => routedMapRef.current?.leafletMap?.leafletElement,
    [routedMapRef]
  );

  const { isInitialCameraResolved } = useGeoportalInitialValues();

  const markerRef = useRef(undefined);
  const markerAccentRef = useRef(undefined);
  const [pos, setPos] = useState<[number, number] | null>(null);
  // TODO: move all these to a custom hook and collect all calls to updateFeatureInfo there
  const [shouldUpdateFeatureInfo, setShouldUpdateFeatureInfo] =
    useState<boolean>(false);
  const layersIdle = useSelector(getLayersIdle);
  const triggerFeatureInfoUpdate = useSelector(getTriggerFeatureInfoUpdate);
  const mapInteractionEnabled = useSelector(getUIMapInteractionEnabled);
  const hashWriteEnabled = useSelector(getUIHashWriteEnabled);
  const visibleControls = useSelector(getUIVisibleControls);

  useEffect(() => {
    const maps = layers
      .filter((l) => l.layerType === "vector" && l.visible)
      .map((l) => maplibreMapsRef.current.get(l.id))
      .filter((m) => m !== undefined);
    if (maplibreMaps.length !== maps.length) {
      setMaplibreMaps(maps);
    }
  }, [layers, layersIdle]);

  // custom hooks
  const {
    handleCesiumHostChange,
    handleZoomToFeature,
    isOrbiting,
    shouldMountCesium,
    toggleOrbit,
  } = useGeoportalCesium({ allow3d, get2dMap: getLeafletMap });

  const cesiumInfoBox = useGeoportalCesiumInfoBox({
    isOrbiting,
    onOrbitToggle: toggleOrbit,
    onZoomToFeature: handleZoomToFeature,
  });

  const previousPositionRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  const updateLayersIdleState = useCallback(
    (skipPositionChangeCheck?: boolean) => {
      if (layersIdle) {
        const leaflet = getLeafletMap();
        if (leaflet) {
          const center = leaflet.getCenter();
          const zoom = leaflet.getZoom();
          const newPosition = { lat: center.lat, lng: center.lng, zoom };

          if (previousPositionRef.current && !skipPositionChangeCheck) {
            const prev = previousPositionRef.current;
            const positionChanged =
              Math.abs(newPosition.lat - prev.lat) > 0.0001 ||
              Math.abs(newPosition.lng - prev.lng) > 0.0001 ||
              newPosition.zoom !== prev.zoom;

            if (!positionChanged) {
              console.debug("Position unchanged, skipping idle state update");
              return;
            }
          }

          previousPositionRef.current = newPosition;
        }

        console.debug("Layers are idle, setting layers idle to false");
        dispatch(setLayersIdle(false));
      }
    },
    [layersIdle, dispatch, getLeafletMap]
  );

  useDispatchSachdatenInfoText();
  const routingOptions = useMemo(
    () => ({
      getLeafletMap,
      getLeafletZoom,
      isHashWriteEnabled: () => {
        if (!hashWriteEnabled) {
          return false;
        }

        if (getIsTransitioning()) {
          return false;
        }

        if (getIsCesium()) {
          return initialViewApplied;
        }

        return isInitialCameraResolved;
      },
      labels: {
        writeLeafletLike: "GPM:2D:writeLocation",
        topicMapLocation: "GPM:TopicMap:locationChangedHandler",
        cesiumScene: "GPM:3D",
      },
    }),
    [
      getLeafletMap,
      getLeafletZoom,
      getIsTransitioning,
      getIsCesium,
      hashWriteEnabled,
      initialViewApplied,
      isInitialCameraResolved,
    ]
  );

  const { handleTopicMapLocationChange } = useMapHashRouting(routingOptions);

  const { gazData } = useGazData();

  useFeatureInfoModeCursorStyle();

  const onComplete = useCallback(
    (selection: SelectionItem) => {
      if (layers.filter((l) => l.layerType === "vector").length === 0) return;
      selectionSemanticIdentifierRef.current =
        selection.semanticIdentifier ?? undefined;
      // Note: This callback is only called from useSelectionTopicMap for Leaflet selections
      // No need to check getIsLeaflet() here - it's redundant and causes stale closure issues
      if (
        (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
        !isAreaType(selection.type as ENDPOINT) &&
        !getIsCesium()
      ) {
        const selectedPos = getFromWebMercatorToWGS84([
          selection.x,
          selection.y,
        ]);
        const leaflet = getLeafletMap();
        const layersIdle = getLayersIdle(store.getState());

        if (!leaflet || !layersIdle) {
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

  const selectionTopicMapOptions = useMemo(
    () => ({
      onComplete,
      padding: selectionPadding,
    }),
    [onComplete]
  );

  useSelectionTopicMap(selectionTopicMapOptions);

  useEffect(() => {
    if (layers.length === 0) {
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      dispatch(setSelectedFeature(null));
    } else {
      updateLayersIdleState(true);
    }
  }, [layers]);

  useEffect(() => {
    const leaflet = getLeafletMap();
    if (
      uiMode !== UIMode.FEATURE_INFO &&
      markerRef.current !== undefined &&
      leaflet
    ) {
      leaflet.removeLayer(markerRef.current);
      leaflet.removeLayer(markerAccentRef.current);
      // Clear refs when leaving feature info mode
      markerRef.current = undefined;
      markerAccentRef.current = undefined;
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      setPos(null);
      dispatch(setPreferredLayerId(""));
    }
  }, [uiMode, getLeafletMap, dispatch]);

  useEffect(() => {
    if (isModeFeatureInfo) {
      setShouldUpdateFeatureInfo(true);
    }
  }, [maplibreMaps]);

  useEffect(() => {
    const leaflet = getLeafletMap();
    if (!leaflet) {
      return;
    }
    const navigationHandlers = [
      leaflet.dragging,
      leaflet.touchZoom,
      leaflet.doubleClickZoom,
      leaflet.scrollWheelZoom,
      leaflet.boxZoom,
      leaflet.keyboard,
      leaflet.tap,
    ];
    navigationHandlers.forEach((handler) => {
      if (!handler) {
        return;
      }
      if (mapInteractionEnabled) {
        handler.enable();
      } else {
        handler.disable();
      }
    });
  }, [mapInteractionEnabled, getLeafletMap]);

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
    if (!visibleControls.infoBox) {
      return <div></div>;
    }

    if (getIsCesium()) {
      return cesiumInfoBox ?? <div></div>;
    }

    if (!getIsLeaflet()) {
      return <div></div>;
    }

    if (isModeMeasurement) {
      return <InfoBoxMeasurement key={uiMode} />;
    }

    if (selectedFeature || loadingFeatureInfo) {
      return <FeatureInfoBox pos={pos} onZoomToFeature={handleZoomToFeature} />;
    }

    return <div></div>;
  }, [
    cesiumInfoBox,
    getIsLeaflet,
    getIsCesium,
    isModeMeasurement,
    uiMode,
    selectedFeature,
    loadingFeatureInfo,
    pos,
    handleZoomToFeature,
    visibleControls.infoBox,
  ]);

  useEffect(() => {
    if (shouldUpdateFeatureInfo || triggerFeatureInfoUpdate > 0)
      updateFeatureInfoLeaflet();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldUpdateFeatureInfo, triggerFeatureInfoUpdate]);

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

  const show2dContainer = !(isCesium && !initialViewApplied);

  const createLayerOptions = useMemo(
    () => ({
      mode: uiMode,
      dispatch,
      zoom: getLeafletZoom(),
      selectedFeature,
      leafletMap: getLeafletMap(),
      maplibreMapsRef,
      store,
      selectionSemanticIdentifierRef,
      setMaplibreMaps: (entry) => dispatch(setMaplibreMapsStore(entry)),
    }),
    [
      uiMode,
      dispatch,
      getLeafletZoom,
      selectedFeature,
      getLeafletMap,
      maplibreMapsRef,
      setMaplibreMapsStore,
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
      <div
        className={"map-container-2d"}
        style={{
          zIndex: 400,
          visibility: show2dContainer ? "visible" : "hidden",
        }}
      >
        <TopicMapComponent
          gazData={gazData}
          modalMenu={<GeoportalModalMenu />}
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
            // blocks clicks/drag/wheel/touch while programmatic clicks
            // (e.g. the autoSelect flow) still work
            ...(mapInteractionEnabled ? {} : { pointerEvents: "none" }),
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
              // Use refs for removal to avoid stale closure issues on zoom change
              if (markerRef.current !== undefined) {
                map.removeLayer(markerRef.current);
              }
              if (markerAccentRef.current !== undefined) {
                map.removeLayer(markerAccentRef.current);
              }

              map.getPane(
                "markerPaneWithBlendModeDifference"
              ).style.zIndex = 601;
              const newMarkerAccent = L.marker([e.latlng.lat, e.latlng.lng], {
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
              }).addTo(map);
              markerAccentRef.current = newMarkerAccent;

              const newMarker = L.marker([e.latlng.lat, e.latlng.lng], {
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
              }).addTo(map);
              markerRef.current = newMarker;

              setPos([e.latlng.lat, e.latlng.lng]);
            }
            onClickTopicMap(e, {
              dispatch,
              mode: uiMode,
              store,
              zoom: getLeafletZoom(),
              map: map,
              maplibreMapsRef,
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
            getBackgroundLayers(
              backgroundLayer.layers,
              backgroundLayer.opacity
            )}

          {useCreateCismapLayers(layers, createLayerOptions)}
          <PrintPreview />
          <Measurements snappingLayers={maplibreMaps} />
        </TopicMapComponent>
        <AdhocSelectionSync maplibreMapsRef={maplibreMapsRef} />
      </div>
      <GeoportalCesiumHost
        allow3d={allow3d}
        shouldMountCesium={shouldMountCesium}
        onHostChange={handleCesiumHostChange}
      />
    </>
  );
};

const GeoportalModalMenu = () => {
  const { jwt, setJWT } = useAuth();
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey, showOverlayHandler } = useOverlayTourContext();
  const [isLoginFormVisible, setIsLoginFormVisible] = useState(false);
  const version = getApplicationVersion(versionData);

  const showOverlayFromOutside = useCallback(
    (key: string) => {
      setAppMenuVisible(false);
      setSecondaryWithKey(key);
      showOverlayHandler();
    },
    [setAppMenuVisible, setSecondaryWithKey, showOverlayHandler]
  );

  return (
    <GenericModalApplicationMenu
      {...getCollabedHelpComponentConfig({
        versionString: version,
        showOverlayFromOutside,
        loginFormToggle: () => setIsLoginFormVisible(!isLoginFormVisible),
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
          <Tooltip title={jwt ? "Abmeldung" : "Anmeldung"} zIndex={99999999}>
            <Button
              type="text"
              onClick={() =>
                jwt ? setJWT(null) : setIsLoginFormVisible(!isLoginFormVisible)
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
  );
};

const LibreGeoportalMap = ({ allow3d }: MapProps) => {
  useGeoportalHelpOverlays();

  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const visibleControls = useSelector(getUIVisibleControls);
  const mapInteractionEnabled = useSelector(getUIMapInteractionEnabled);
  const hashWriteEnabled = useSelector(getUIHashWriteEnabled);
  const { pathname } = useLocation();
  // resolved from the route, not from the store: the map is constructed on
  // mount and refreshExpiredTiles only takes effect at construction, so it
  // cannot wait for RoutedApp to dispatch
  const refreshExpiredTiles = useMemo(
    () => !findFachzwillingByPathname(pathname)?.disableExpiredTileRefresh,
    [pathname]
  );
  const { map: libreMap } = useLibreContext();
  const libreLayers = useLibreLayers();
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModePrint = uiMode === UIMode.PRINT;
  const libreDrawMode = useSelector(getLibreDrawMode);
  const { selectedFeature: selectedMeasurement } = useMeasurements();
  const {
    pos,
    onSelectionChanged: handleLibreSelectionChanged,
    selectFromHits: handleLibreSelectFromHits,
  } = useLibreMapSelectionHandler(libreMap);
  useLibreTriggerSelectionSync(libreMap);

  const { isCesium, isTransitioning } = useMapFrameworkSwitcherContext();
  const { initialViewApplied } = useCesiumContext();

  useMaplibreRuntimeBridge({
    id: "geoportal-maplibre",
    map: libreMap,
    enabled: !isCesium && !isTransitioning,
    claimOnInteraction: true,
  });

  // SPIKE: drive the existing leaflet<->cesium transition with a leaflet-shaped
  // facade over the maplibre map.
  const transitionShim = useMaplibreTransitionShim(libreMap);
  const getTransitionMap = useCallback(
    () => transitionShim as unknown as LeafletMap | null,
    [transitionShim]
  );

  const {
    handleCesiumHostChange,
    handleZoomToFeature,
    isOrbiting,
    shouldMountCesium,
    toggleOrbit,
  } = useGeoportalCesium({
    allow3d,
    get2dMap: getTransitionMap,
    isSyncEnabled: isCesium || isTransitioning,
  });

  const cesiumInfoBox = useGeoportalCesiumInfoBox({
    isOrbiting,
    onOrbitToggle: toggleOrbit,
    onZoomToFeature: handleZoomToFeature,
  });

  const show2dContainer = !(isCesium && !initialViewApplied);

  return (
    <>
      <div style={{ visibility: show2dContainer ? "visible" : "hidden" }}>
        <CarmaMap
          appKey="geoportal"
          mapEngine="maplibre"
          backgroundLayers={null}
          zoomControls={false}
          fullScreenControl={false}
          terrainControl={false}
          compassControl={false}
          locatorControl={false}
          gazetteerSearchControl={false}
          modalMenuControl={showHamburgerMenu}
          libreLayers={libreLayers}
          disableInternalSelection={true}
          hashWriteEnabled={hashWriteEnabled}
          refreshExpiredTiles={refreshExpiredTiles}
          interactive={mapInteractionEnabled}
          restrictCamera={RESTRICT_LIBRE_CAMERA || isModePrint}
          selectionEnabled={
            mapInteractionEnabled && !isModeMeasurement && !isModePrint
          }
          onSelectionChanged={handleLibreSelectionChanged}
          selectFromHits={handleLibreSelectFromHits}
          modalMenu={<GeoportalModalMenu />}
        />
        {/* the 2D draw host and its info box stay out of the way in 3D, where
            the cesium annotation runtime owns measurements */}
        {isModeMeasurement && !isCesium && (
          <MeasurementHost mode={libreDrawMode} snapping styleVariant="carma" />
        )}
        {visibleControls.infoBox &&
          (isCesium ? (
            cesiumInfoBox
          ) : isModeMeasurement || selectedMeasurement ? (
            <MeasurementInfoBox selectionPadding={selectionPadding} />
          ) : (
            <FeatureInfoBox
              pos={pos ?? undefined}
              onZoomToFeature={handleZoomToFeature}
            />
          ))}
        {!isCesium && <LibrePrintPreview />}
      </div>
      <GeoportalCesiumHost
        allow3d={allow3d}
        shouldMountCesium={shouldMountCesium}
        onHostChange={handleCesiumHostChange}
      />
    </>
  );
};

export const GeoportalMap = (props: MapProps) => {
  const useLibreMap = useLibreMapEnabled();

  return useLibreMap ? (
    <LibreGeoportalMap {...props} />
  ) : (
    <LeafletGeoportalMap {...props} />
  );
};

export default GeoportalMap;
