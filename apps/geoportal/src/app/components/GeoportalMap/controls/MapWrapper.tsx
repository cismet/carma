import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { useDispatch, useSelector } from "react-redux";

import { Tooltip } from "antd";

import {
  faEyeSlash,
  faHouseChimney,
  faInfo,
  faMinus,
  faPlus,
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
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  PitchingCompass,
  useCesiumContext,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/engines/cesium/react/runtime";
import { NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS } from "@carma-mapping/engines-interop/navigation-controls";
import { flyViewStateInCesium } from "@carma-mapping/engines-interop/view-state";
import {
  MapFrameworkSwitcher,
  FullscreenControl,
  LibrePitchingCompass,
  LibreTerrainControl,
  RoutedMapLocateControl,
  useMapFrameworkSwitcherContext,
} from "@carma-mapping/components";
import { AddonHost } from "@carma-mapping/addons";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  ControlLayoutCanvas,
} from "@carma-mapping/map-controls-layout";
import {
  WUPPERTAL_TERRAIN_SOURCE_ID,
  useCameraRestriction,
} from "@carma-mapping/engines/maplibre";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { useLibreMapEnabled } from "../../../hooks/useLibreMapEnabled";
import { MeasurementControl } from "@carma-commons/measurements";
import { useLibreContext } from "@carma-mapping/contexts";

import { SHOW_LIBRE_TERRAIN_CONTROL } from "../../../config/app.config";
import { GeoportalMap } from "../GeoportalMap.tsx";
import { ObliqueControls } from "../../../oblique/components/ObliqueControls.tsx";
import LayerWrapper from "../../layers/LayerWrapper.tsx";

import useLeafletZoomControls from "../../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useHighlightModeSync } from "../../../hooks/useHighlightModeSync.ts";
import { useMapStyleReduxSync } from "../../../hooks/useMapStyleReduxSync";
import { useTourRefCollabLabels } from "../../../hooks/useTourRefCollabLabels.ts";
import { useWindowSize } from "../../../hooks/useWindowSize.ts";
import { useGeoportalCesiumNavigationShortcuts } from "../../../hooks/useGeoportalCesiumNavigationShortcuts.ts";
import { useGeoportalHomeValues } from "../../../hooks/useGeoportalInitialValues.ts";

import { useOblique } from "../../../oblique/hooks/useOblique.ts";

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

const CESIUM_ROTATION_SHORTCUT_ACTIONS = [
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_CLOCKWISE,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE,
] as const;
const DEVELOPER_ONLY_NAVIGATION_SHORTCUT_ACTIONS = [
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.GO_HOME,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.TOGGLE_ORBIT,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT,
] as const;
const NON_DEVELOPER_OBLIQUE_DISABLED_NAVIGATION_SHORTCUT_ACTIONS = [
  ...CESIUM_ROTATION_SHORTCUT_ACTIONS,
  ...DEVELOPER_ONLY_NAVIGATION_SHORTCUT_ACTIONS,
] as const;
const NO_NAVIGATION_SHORTCUT_ACTIONS: readonly [] = [];

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

  const wrapperRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const { map: libreMap } = useLibreContext();

  // Get framework switcher state from context
  const {
    isLeaflet,
    isCesium,
    isPreparingCesiumTransition,
    preparingCesiumMessage,
  } = useMapFrameworkSwitcherContext();
  const statusFooterText = isPreparingCesiumTransition
    ? preparingCesiumMessage ?? "3D Modelle werden geladen"
    : null;

  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const isRotationLockedForPrint = uiMode === UIMode.PRINT && showLibreMap;

  const cameraRestricted = useCameraRestriction(libreMap)?.restricted ?? true;
  const libreDrawMode = useSelector(getLibreDrawMode);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const visibleControls = useSelector(getUIVisibleControls);
  const allow3d = visibleControls.allow3d && hasGPU;
  const zenMode = useSelector(getZenMode);
  const ctx = useCesiumContext();
  const configSelection = useSelector(getConfigSelection);

  const {
    isObliqueMode,
    isPreviewVisible: isObliquePreviewVisible,
    maxFov,
    minFov,
    restoreFovOnLeave,
  } = useOblique();

  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(ctx, {
    fovMode: isObliqueMode,
  });
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();
  const {
    defaultHomeViewState,
    homeCenter,
    homeLeafletZoom,
    homeMaplibreZoom,
    homeTooltip,
  } = useGeoportalHomeValues();
  const handleCesiumHomeClick = useCallback(() => {
    if (!isCesium) return;

    ctx.withScene((scene) => {
      flyViewStateInCesium(scene, defaultHomeViewState, {
        duration: 2,
        applyFov: false,
      });
    });
  }, [ctx, defaultHomeViewState, isCesium]);

  useGeoportalCesiumNavigationShortcuts({
    allowedActions:
      isModeMeasurement || isObliqueMode
        ? undefined
        : CESIUM_ROTATION_SHORTCUT_ACTIONS,
    disabledActions: isObliqueMode
      ? flags.isDeveloperMode
        ? CESIUM_ROTATION_SHORTCUT_ACTIONS
        : NON_DEVELOPER_OBLIQUE_DISABLED_NAVIGATION_SHORTCUT_ACTIONS
      : flags.isDeveloperMode
      ? NO_NAVIGATION_SHORTCUT_ACTIONS
      : DEVELOPER_ONLY_NAVIGATION_SHORTCUT_ACTIONS,
    enabled: isCesium && !isObliquePreviewVisible,
    isObliqueMode,
    maxFov,
    minFov,
    onGoHome: handleCesiumHomeClick,
    resetFov: restoreFovOnLeave,
  });

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
  const prevIsModeMeasurementRef = useRef(isModeMeasurement);
  useEffect(() => {
    const prev = prevIsModeMeasurementRef.current;
    prevIsModeMeasurementRef.current = isModeMeasurement;

    if (!prev && isModeMeasurement) {
      dispatch(setLibreDrawMode("line"));
      return;
    }
    if (prev && !isModeMeasurement && libreDrawMode !== "none") {
      dispatch(setLibreDrawMode("none"));
    }
  }, [dispatch, isModeMeasurement, libreDrawMode]);

  // custom hooks

  useDispatchSachdatenInfoText();
  useMapStyleReduxSync();
  useHighlightModeSync();

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
    <ControlLayout>
      <AddonHost />
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
            paddingTop: visibleControls.navbar
              ? "calc(4rem + var(--system-message-banner-height, 0px))"
              : "var(--system-message-banner-height, 0px)",
          }}
        >
          {/* adds padding for topnavbar (+ banner if visible)*/}
          {visibleControls.zoom && (
            <Control position="topleft" order={10}>
              <div ref={tourRefLabels.zoom} className="flex flex-col">
                <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
                  <ControlButtonStyler
                    onClick={(event) => {
                      if (isLeaflet) {
                        if (showLibreMap) {
                          libreMap?.zoomIn();
                        } else {
                          zoomInLeaflet();
                        }
                      } else {
                        handleZoomInCesium(event);
                      }
                    }}
                    className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                    dataTestId="zoom-in-control"
                  >
                    <FontAwesomeIcon icon={faPlus} className="text-base" />
                  </ControlButtonStyler>
                </Tooltip>
                <Tooltip
                  title="Maßstab verkleinern (Zoom out)"
                  placement="right"
                >
                  <ControlButtonStyler
                    onClick={(event) => {
                      if (isLeaflet) {
                        if (showLibreMap) {
                          libreMap?.zoomOut();
                        } else {
                          zoomOutLeaflet();
                        }
                      } else {
                        handleZoomOutCesium(event);
                      }
                    }}
                    className="!rounded-t-none !border-t-[1px]"
                    dataTestId="zoom-out-control"
                  >
                    <FontAwesomeIcon icon={faMinus} className="text-base" />
                  </ControlButtonStyler>
                </Tooltip>
              </div>
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
                    disabled={
                      (isLeaflet && (!showLibreMap || cameraRestricted)) ||
                      isRotationLockedForPrint ||
                      isObliquePreviewVisible
                    }
                  >
                    {showLibreMap && !isCesium ? (
                      <LibrePitchingCompass map={libreMap} />
                    ) : (
                      <PitchingCompass />
                    )}
                  </ControlButtonStyler>
                </Tooltip>

                <MapFrameworkSwitcher
                  enableMobileWarning={true}
                  className="!rounded-t-none !border-t-[1px]"
                  ref={tourRefLabels.toggle2d3d}
                  useDisabledStyle={false}
                  // nativeTooltip={true}
                />
              </div>
            </Control>
          )}
          {showFullscreenButton && visibleControls.fullscreen && (
            <Control position="topleft" order={20}>
              <FullscreenControl tourRef={tourRefLabels?.fullScreen} />
            </Control>
          )}
          {!isObliquePreviewVisible && showLocatorButton && isMobile && (
            <Control position="topleft" order={30}>
              <RoutedMapLocateControl
                tourRefLabels={tourRefLabels}
                disabled={false}
                nativeTooltip={true}
              />
            </Control>
          )}
          {!isObliquePreviewVisible && visibleControls.home && (
            <Control position="topleft" order={40}>
              <Tooltip
                title={homeTooltip ?? "Auf Rathaus Barmen positionieren"}
                placement="right"
              >
                <ControlButtonStyler
                  ref={tourRefLabels.home}
                  onClick={() => {
                    if (showLibreMap) {
                      if (isCesium) {
                        handleCesiumHomeClick();
                      } else {
                        libreMap?.flyTo({
                          center: [homeCenter[1], homeCenter[0]],
                          zoom: homeMaplibreZoom,
                          essential: true,
                        });
                      }
                    } else {
                      routedMap.leafletMap.leafletElement.flyTo(
                        homeCenter,
                        homeLeafletZoom
                      );
                      handleCesiumHomeClick();
                    }
                  }}
                  dataTestId="home-control"
                >
                  <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
                </ControlButtonStyler>
              </Tooltip>
            </Control>
          )}
          {!isObliquePreviewVisible &&
            !isMobileDevice &&
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
          {!isObliquePreviewVisible && visibleControls.featureInfo && (
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

          {SHOW_LIBRE_TERRAIN_CONTROL &&
            !isObliquePreviewVisible &&
            showLibreMap &&
            visibleControls.terrain && (
              <Control position="topleft" order={80}>
                <LibreTerrainControl
                  map={libreMap}
                  appKey="geoportal"
                  source={WUPPERTAL_TERRAIN_SOURCE_ID}
                />
              </Control>
            )}
          {!isObliquePreviewVisible && visibleControls.layerButtons && (
            <Control position="topcenter" order={10}>
              <LayerWrapper />
            </Control>
          )}
          {visibleControls.gazetteer && (
            <Control position="bottomleft" order={10}>
              <div
                ref={tourRefLabels.gazetteer}
                className={`h-full w-full transition-opacity duration-200 ${
                  isObliquePreviewVisible
                    ? "opacity-0 pointer-events-none"
                    : "opacity-100"
                }`}
              >
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
            marginTop: zenMode || !visibleControls.navbar ? "0px" : "-56px",
          }}
        >
          <GeoportalMap height={height} width={width} allow3d={allow3d} />
          {isCesium && <ObliqueControls hideControls={zenMode} />}
        </div>
      </ControlLayoutCanvas>
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000000,
          pointerEvents: "none",
        }}
      >
        <ResponsiveStatusBar text={statusFooterText} />
      </div>
    </ControlLayout>
  );
};

export default MapWrapper;
