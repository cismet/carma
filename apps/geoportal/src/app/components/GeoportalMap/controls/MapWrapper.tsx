import { useContext, useEffect, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { useDispatch, useSelector } from "react-redux";

import { Tooltip } from "antd";

import {
  faEyeSlash,
  faHouseChimney,
  faInfo,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import {
  SelectionMapMode,
  type SelectionMetaData,
  useGazData,
  useSelection,
} from "@carma-appframeworks/portals";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import type { SearchResultItem } from "@carma-mapping/fuzzy-search";
import { detectWebGLContext } from "@carma-commons/utils";
import {
  MapFrameworkSwitcher,
  FullscreenControl,
  LibreMapLocateControl,
  LibrePitchingCompass,
  RoutedMapLocateControl,
  useMapFrameworkSwitcherContext,
  ZoomControl,
} from "@carma-mapping/components";
import { AddonHost, useAddonState } from "@carma-mapping/addons";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  ControlLayoutCanvas,
} from "@carma-mapping/map-controls-layout";
import { useCameraRestriction } from "@carma-mapping/engines/maplibre";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { useLibreMapEnabled } from "../../../hooks/useLibreMapEnabled";
import { useLibre3dToggle } from "../../../hooks/libre/useLibre3dToggle";
import { useLibre3dMapModeController } from "../../../hooks/libre/useLibre3dMapModeController";
import { useEnterLibre3dForMeshLayers } from "../../../hooks/libre/useMeshStyleLayers";
import { MeasurementControl } from "@carma-commons/measurements";
import { useLibreContext } from "@carma-mapping/contexts";

import { GeoportalMap } from "../GeoportalMap.tsx";
import { MapLoadingProgress } from "../MapLoadingProgress";
import LayerWrapper from "../../layers/LayerWrapper.tsx";
import { VehicleAnimationInfoBoxSync } from "../../../hooks/useVehicleAnimationInfoBox";

import { useDispatchSachdatenInfoText } from "../../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useHighlightModeSync } from "../../../hooks/useHighlightModeSync.ts";
import { useAnnotationModeSync } from "../../../hooks/useAnnotationModeSync";
import { Measurement3dModeSync } from "../../annotations/Measurement3dHost";
import {
  useClearFeatureSelection,
  useClearSelectionOnEscape,
} from "../../../hooks/useClearFeatureSelection";
import { useMapStyleReduxSync } from "../../../hooks/useMapStyleReduxSync";
import { useTourRefCollabLabels } from "../../../hooks/useTourRefCollabLabels.tsx";
import { useWindowSize } from "../../../hooks/useWindowSize.ts";
import { useGeoportalHomeValues } from "../../../hooks/useGeoportalInitialValues.ts";

import { cancelOngoingRequests } from "../topicmap.utils";

import {
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../../store/slices/features.ts";
import {
  getConfigSelection,
  getShowFullscreenButton,
  getShowLocatorButton,
} from "../../../store/slices/mapping.ts";
import {
  getLibreDrawMode,
  setLibreDrawMode,
} from "../../../store/slices/measurements.ts";
import {
  getUIMode,
  getUIVisibleControls,
  getZenMode,
  setZenMode,
  toggleUIMode,
  UIMode,
} from "../../../store/slices/ui.ts";

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

const MapWrapper = () => {
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

  // Detect mobile device or browser's device toolbar (responsive design mode)
  const isMobileDevice =
    isMobile ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    "ontouchstart" in window;

  const showLibreMap = useLibreMapEnabled();
  // The map-frame loading bar reports terrain and shadow work, so it only
  // belongs on screen while the shadow simulation is switched on.
  const [shadowSimulationState] = useAddonState("shadowSimulation");
  const shadowEnabled = shadowSimulationState?.enabled ?? false;
  const showLoadingProgress = shadowEnabled;
  // a Schwebebahn ride keeps only its panel and the info box on screen
  const [vehicleAnimationState] = useAddonState("vehicleAnimation");
  const isRidingVehicle = vehicleAnimationState?.isRiding ?? false;

  const wrapperRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const { map: libreMap } = useLibreContext();
  const { libre3d, toggle: toggleLibre3d } = useLibre3dToggle(libreMap);
  useLibre3dMapModeController({
    enabled: showLibreMap,
    libre3d,
    toggle: toggleLibre3d,
  });
  useEnterLibre3dForMeshLayers({
    enabled: showLibreMap,
    libre3d,
    toggle: toggleLibre3d,
  });
  // starting the shadow simulation in 2D switches to 3D; going back to 2D
  // with shadows on afterwards is left alone
  const shadowWasEnabled = useRef(false);
  useEffect(() => {
    const started = shadowEnabled && !shadowWasEnabled.current;
    shadowWasEnabled.current = shadowEnabled;
    if (showLibreMap && started && !libre3d) {
      toggleLibre3d();
    }
  }, [showLibreMap, shadowEnabled, libre3d, toggleLibre3d]);

  const { isLeaflet } = useMapFrameworkSwitcherContext();

  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const isRotationLockedForPrint = uiMode === UIMode.PRINT && showLibreMap;

  const cameraRestricted = useCameraRestriction(libreMap)?.restricted ?? true;
  const libreDrawMode = useSelector(getLibreDrawMode);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const visibleControls = useSelector(getUIVisibleControls);
  // the leaflet map has no 3D view
  const allow3d = visibleControls.allow3d && hasGPU && showLibreMap;
  const zenMode = useSelector(getZenMode);
  const configSelection = useSelector(getConfigSelection);

  const {
    homeCenter,
    homeLeafletZoom,
    homeMaplibreZoom,
    homeMaplibrePitch,
    homeMaplibreBearing,
    homeMaplibre3dPitch,
    homeMaplibre3dBearing,
    homeTooltip,
  } = useGeoportalHomeValues();
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const [zenButtonHidden, setZenButtonHidden] = useState(false);
  const [isHoveringZenButton, setIsHoveringZenButton] = useState(false);

  useEffect(() => {
    if (zenMode && !zenButtonHidden && !isHoveringZenButton) {
      const timer = setTimeout(() => {
        setZenButtonHidden(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [zenMode, zenButtonHidden, isHoveringZenButton]);
  // in the maplibre 3D view the measurement mode is the 3D measurement
  // (useMeasurement3dModeSync); toggling 3D drops only an unfinished line
  const isDrawing2d = isModeMeasurement && !libre3d;
  const prevIsDrawing2dRef = useRef(isDrawing2d);
  useEffect(() => {
    const prev = prevIsDrawing2dRef.current;
    prevIsDrawing2dRef.current = isDrawing2d;

    if (!prev && isDrawing2d) {
      dispatch(setLibreDrawMode("line"));
      return;
    }
    if (prev && !isDrawing2d && libreDrawMode !== "none") {
      dispatch(setLibreDrawMode("none"));
    }
  }, [dispatch, isDrawing2d, libreDrawMode]);

  // custom hooks

  useDispatchSachdatenInfoText();
  useMapStyleReduxSync();
  useHighlightModeSync();
  useAnnotationModeSync();
  useClearSelectionOnEscape();
  const { hasSelection, clearFeatureSelection } = useClearFeatureSelection();

  const tourRefLabels = useTourRefCollabLabels();
  const { gazData } = useGazData();
  const { width, height } = useWindowSize(wrapperRef);

  const handleToggleFeatureInfo = () => {
    cancelOngoingRequests();
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  };

  useFeatureInfoModeCursorStyle("routedMap", libreMap);

  const { setSelection } = useSelection();

  const onGazetteerSelection = (
    selection: SearchResultItem,
    skipMapMovement = false
  ) => {
    if (!selection) {
      console.debug("onGazetteerSelection", selection);
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectedFromMapMode: isLeaflet
        ? SelectionMapMode.MODE_2D
        : SelectionMapMode.MODE_3D,
      selectionTimestamp: skipMapMovement ? null : Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };

    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  return (
    <ControlLayout hideControls={isRidingVehicle}>
      <AddonHost />
      <Measurement3dModeSync />
      <VehicleAnimationInfoBoxSync />
      {zenMode ? (
        <Control position="topcenter" order={10}>
          <button
            className={`text-xl size-16 hover:text-gray-600 button-shadow bg-white/80 rounded-md transition-all duration-300 pointer-events-auto`}
            onClick={() => {
              if (zenButtonHidden) {
                setZenButtonHidden(false);
              } else {
                setIsHoveringZenButton(false);
                dispatch(setZenMode(false));
              }
            }}
            onMouseEnter={() => setIsHoveringZenButton(true)}
            onMouseLeave={() => setIsHoveringZenButton(false)}
            // make sure the shadow is still visible after click
            onMouseDown={(e) => e.preventDefault()}
            style={{
              transform: zenButtonHidden ? "translateY(-87%)" : "translateY(0)",
            }}
            data-test-id="zen-mode-btn"
          >
            <Tooltip
              title={
                <span>
                  Bedienelemente einblenden
                  <br />
                  (Zen-Modus beenden)
                </span>
              }
            >
              <FontAwesomeIcon fixedWidth={true} icon={faEyeSlash} />
            </Tooltip>
          </button>
        </Control>
      ) : (
        <div
          style={{
            paddingTop:
              visibleControls.navbar && !isRidingVehicle
                ? "calc(4rem + var(--system-message-banner-height, 0px))"
                : "var(--system-message-banner-height, 0px)",
          }}
        >
          {/* adds padding for topnavbar (+ banner if visible)*/}
          {visibleControls.zoom && (
            <Control position="topleft" order={10}>
              <ZoomControl
                ref={tourRefLabels.zoom}
                mapEngine={showLibreMap ? "maplibre" : "leaflet"}
                libreMap={libreMap}
              />
            </Control>
          )}
          {allow3d && (
            <Control position="topleft" order={10}>
              <div className="flex flex-col">
                <Tooltip
                  title="mit gedrückter Maustaste drehen und kippen"
                  placement="right"
                >
                  <ControlButtonStyler
                    useDisabledStyle={false}
                    className={
                      "!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                    }
                    ref={tourRefLabels.alignNorth}
                    dataTestId="compass-control"
                    disabled={cameraRestricted || isRotationLockedForPrint}
                  >
                    <LibrePitchingCompass map={libreMap} />
                  </ControlButtonStyler>
                </Tooltip>

                <MapFrameworkSwitcher
                  enableMobileWarning={true}
                  className="!rounded-t-none !border-t-[1px]"
                  ref={tourRefLabels.toggle2d3d}
                  useDisabledStyle={false}
                  // nativeTooltip={true}
                  onToggleOverride={toggleLibre3d}
                  is3d={libre3d}
                />
              </div>
            </Control>
          )}
          {showFullscreenButton && visibleControls.fullscreen && (
            <Control position="topleft" order={20}>
              <FullscreenControl tourRef={tourRefLabels?.fullScreen} />
            </Control>
          )}
          {showLocatorButton && showLibreMap && (
            <Control position="topleft" order={30}>
              <LibreMapLocateControl
                tourRef={tourRefLabels.navigator}
                disabled={false}
                nativeTooltip={true}
              />
            </Control>
          )}
          {showLocatorButton && !showLibreMap && isMobile && (
              <Control position="topleft" order={30}>
                <RoutedMapLocateControl
                  tourRefLabels={tourRefLabels}
                  disabled={false}
                  nativeTooltip={true}
                />
              </Control>
            )}
          {visibleControls.home && (
            <Control position="topleft" order={40}>
              <Tooltip
                title={homeTooltip ?? "Auf Rathaus Barmen positionieren"}
                placement="right"
              >
                <ControlButtonStyler
                  ref={tourRefLabels.home}
                  onClick={() => {
                    if (showLibreMap) {
                      libreMap?.flyTo({
                        center: [homeCenter[1], homeCenter[0]],
                        zoom: homeMaplibreZoom,
                        pitch: libre3d ? homeMaplibre3dPitch : homeMaplibrePitch,
                        bearing: libre3d
                          ? homeMaplibre3dBearing
                          : homeMaplibreBearing,
                        essential: true,
                      });
                    } else {
                      routedMap.leafletMap.leafletElement.flyTo(
                        homeCenter,
                        homeLeafletZoom
                      );
                    }
                  }}
                  dataTestId="home-control"
                >
                  <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
                </ControlButtonStyler>
              </Tooltip>
            </Control>
          )}
          {// touch measuring broke on leaflet only; maplibre gets it back
          (!isMobileDevice || showLibreMap) &&
            visibleControls.measurement && (
              <MeasurementControl
                position="topleft"
                order={60}
                tooltip={
                  isModeMeasurement
                    ? "Messungsmodus ausschalten"
                    : "Messungsmodus einschalten"
                }
                tooltipPlacement="right"
                showInfoBox={false}
                ref={tourRefLabels.measurement}
              />
            )}
          {visibleControls.featureInfo && (
            <Control position="topleft" order={50}>
              <Tooltip
                title={
                  isModeFeatureInfo
                    ? "Modus Multi-Sachdatenabfrage ausschalten"
                    : "Modus Multi-Sachdatenabfrage einschalten"
                }
                placement="right"
              >
                <ControlButtonStyler
                  disabled={!isLeaflet}
                  useDisabledStyle={!isLeaflet}
                  onClick={() => {
                    handleToggleFeatureInfo();
                    dispatch(setSelectedFeature(null));
                    dispatch(setSecondaryInfoBoxElements([]));
                    dispatch(setFeatures([]));
                    dispatch(setPreferredLayerId(""));
                  }}
                  className="font-semibold"
                  ref={tourRefLabels.featureInfo}
                  dataTestId="feature-info-control"
                >
                  <FontAwesomeIcon
                    icon={faInfo}
                    className={isModeFeatureInfo ? "text-[#1677ff]" : ""}
                  />
                </ControlButtonStyler>
              </Tooltip>
            </Control>
          )}
          {/* a touchscreen has no Escape key to clear the selection with */}
          {flags.featureFlagTouchscreen && (
            <Control position="topleft" order={70}>
              <Tooltip title="Auswahl aufheben" placement="right">
                <ControlButtonStyler
                  disabled={!hasSelection}
                  onClick={clearFeatureSelection}
                  dataTestId="clear-selection-control"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-lg" />
                </ControlButtonStyler>
              </Tooltip>
            </Control>
          )}

          {visibleControls.layerButtons && (
            <Control position="topcenter" order={10}>
              <LayerWrapper />
            </Control>
          )}
          {visibleControls.gazetteer && (
            <Control position="bottomleft" order={10}>
              <div ref={tourRefLabels.gazetteer} className="h-full w-full">
                <LibFuzzySearch
                  gazData={gazData}
                  onSelection={onGazetteerSelection}
                  placeholder="Wohin?"
                  pixelwidth={
                    responsiveState === "normal"
                      ? "300px"
                      : windowSize.width - gap
                  }
                  selection={configSelection}
                  landParcelSearch={true}
                />
              </div>
            </Control>
          )}
        </div>
      )}
      <ControlLayoutCanvas>
        <div
          id="mapContainer"
          className={`h-dvh w-dvw flex flex-1 fixed overflow-hidden`}
          ref={wrapperRef}
          style={{
            marginTop:
              zenMode || isRidingVehicle || !visibleControls.navbar
                ? "0px"
                : "-56px",
          }}
        >
          <GeoportalMap height={height} width={width} />
          {showLibreMap && showLoadingProgress && !isRidingVehicle && (
            <MapLoadingProgress
              navbarVisible={!zenMode && visibleControls.navbar}
            />
          )}
        </div>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export default MapWrapper;
