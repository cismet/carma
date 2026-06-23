import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { useDispatch, useSelector } from "react-redux";

import { Tooltip } from "antd";

import {
  faEyeSlash,
  faHouseChimney,
  faInfo,
  faMinus,
  faMountainCity,
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
  RoutedMapLocateControl,
  useMapFrameworkSwitcherContext,
} from "@carma-mapping/components";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  ControlLayoutCanvas,
} from "@carma-mapping/map-controls-layout";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { MeasurementControl } from "@carma-commons/measurements";

import { GeoportalMap } from "../GeoportalMap.tsx";
import LibreGeoportalMap from "../LibreGeoportalMap.tsx";
import { ObliqueControls } from "../../../oblique/components/ObliqueControls.tsx";
import LayerWrapper from "../../layers/LayerWrapper.tsx";

import useLeafletZoomControls from "../../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../../hooks/useFeatureInfoModeCursorStyle.ts";
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
  getLibreMapRef,
  getShowFullscreenButton,
  getShowLocatorButton,
} from "../../../store/slices/mapping.ts";
import {
  getUIAllow3d,
  getUIMode,
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

  const showLibreMap = flags.featureFlagLibreMap;

  const wrapperRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const libreMapRef = useSelector(getLibreMapRef);
  const allow3d = useSelector(getUIAllow3d) && hasGPU;

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
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
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

  const [showTerrain, setShowTerrain] = useState(false);

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

  // custom hooks

  useDispatchSachdatenInfoText();
  useMapStyleReduxSync();

  const tourRefLabels = useTourRefCollabLabels();
  const { gazData } = useGazData();
  const { width, height } = useWindowSize(wrapperRef);

  const handleToggleFeatureInfo = () => {
    cancelOngoingRequests();
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  };

  useFeatureInfoModeCursorStyle();

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
            paddingTop: "calc(4rem + var(--system-message-banner-height, 0px))",
          }}
        >
          {/* adds padding for topnavbar (+ banner if visible)*/}
          <Control position="topleft" order={10}>
            <div ref={tourRefLabels.zoom} className="flex flex-col">
              <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
                <ControlButtonStyler
                  onClick={(event) => {
                    if (isLeaflet) {
                      if (showLibreMap) {
                        if (libreMapRef.current) {
                          libreMapRef.current.zoomIn();
                        }
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
              <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
                <ControlButtonStyler
                  onClick={(event) => {
                    if (isLeaflet) {
                      if (showLibreMap) {
                        if (libreMapRef.current) {
                          libreMapRef.current.zoomOut();
                        }
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
                      (isLeaflet && !showLibreMap) || isObliquePreviewVisible
                    }
                  >
                    {showLibreMap ? (
                      <LibrePitchingCompass map={libreMapRef.current} />
                    ) : (
                      <PitchingCompass />
                    )}
                  </ControlButtonStyler>
                </Tooltip>

                <MapFrameworkSwitcher
                  enableMobileWarning={true}
                  className="!rounded-t-none !border-t-[1px]"
                  ref={tourRefLabels.toggle2d3d}
                  disabled={isObliquePreviewVisible}
                  useDisabledStyle={false}

                  // nativeTooltip={true}
                />
              </div>
            </Control>
          )}
          {showFullscreenButton && (
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
          {!isObliquePreviewVisible && (
            <Control position="topleft" order={40}>
              <Tooltip
                title="Auf Rathaus Barmen positionieren"
                placement="right"
              >
                <ControlButtonStyler
                  ref={tourRefLabels.home}
                  onClick={() => {
                    if (showLibreMap) {
                      if (libreMapRef.current) {
                        libreMapRef.current.flyTo({
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
          {!isObliquePreviewVisible && !isMobileDevice && (
            <MeasurementControl
              position="topleft"
              order={60}
              disabled={isLeaflet && showLibreMap}
              useDisabledStyle={isLeaflet && showLibreMap}
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
          {!isObliquePreviewVisible && (
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

          {!isObliquePreviewVisible && showLibreMap && (
            <Control position="topleft" order={80}>
              <Tooltip title={"Terrain"} placement="right">
                <ControlButtonStyler
                  onClick={() => {
                    if (libreMapRef.current.terrain) {
                      libreMapRef.current?.setTerrain(null);
                      setShowTerrain(false);
                    } else {
                      libreMapRef.current?.setTerrain({
                        source: "terrainSource",
                        exaggeration: 1,
                      });
                      setShowTerrain(true);
                    }
                  }}
                  className="font-semibold"
                >
                  <FontAwesomeIcon
                    icon={faMountainCity}
                    className={showTerrain ? "text-[#1677ff]" : ""}
                  />
                </ControlButtonStyler>
              </Tooltip>
            </Control>
          )}
          {!isObliquePreviewVisible && (
            <Control position="topcenter" order={10}>
              <LayerWrapper />
            </Control>
          )}
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
        </div>
      )}
      <ControlLayoutCanvas>
        <div
          id="mapContainer"
          className={`h-dvh w-dvw flex flex-1 fixed overflow-hidden`}
          ref={wrapperRef}
          style={{
            marginTop: zenMode ? "0px" : "-56px",
          }}
        >
          {showLibreMap && isLeaflet ? (
            <LibreGeoportalMap />
          ) : (
            <>
              <GeoportalMap height={height} width={width} allow3d={allow3d} />
              {isCesium && <ObliqueControls hideControls={zenMode} />}
            </>
          )}
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
