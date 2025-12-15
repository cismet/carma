import { useContext, useEffect, useRef, useState } from "react";
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
  SelectionMetaData,
  SelectionMapMode,
  useGazData,
  useSelection,
} from "@carma-appframeworks/portals";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import type { SearchResultItem } from "@carma/types";
import { detectWebGLContext } from "@carma-commons/utils";

import {
  PitchingCompass,
  selectViewerModels,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/engines/cesium";
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
import { useAppSearchParams } from "../../../hooks/useAppSearchParams";
import { useDispatchSachdatenInfoText } from "../../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useMapStyleReduxSync } from "../../../hooks/useMapStyleReduxSync";
import { useTourRefCollabLabels } from "../../../hooks/useTourRefCollabLabels.ts";
import { useWindowSize } from "../../../hooks/useWindowSize.ts";

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

// TODO: centralize the hash params update behavior

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

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const libreMapRef = useSelector(getLibreMapRef);
  const allow3d = useSelector(getUIAllow3d) && hasGPU;
  const models = useSelector(selectViewerModels);

  // Get framework switcher state from context
  const { isLeaflet, isCesium } = useMapFrameworkSwitcherContext();

  const effectiveMode2d = isLeaflet || !allow3d;
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const zenMode = useSelector(getZenMode);
  const ctx = useCesiumContext();
  const homeControl = useHomeControl();
  const configSelection = useSelector(getConfigSelection);

  const { isObliqueMode } = useOblique();

  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(ctx, {
    fovMode: isObliqueMode,
  });
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const [pos, setPos] = useState<[number, number] | null>(null);
  const [layoutHeight, setLayoutHeight] = useState(null);
  const [isLocationActive, setIsLocationActive] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [hasFoundLocation, setHasFoundLocation] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);

  const [zenButtonHidden, setZenButtonHidden] = useState(false);
  const [isHoveringZenButton, setIsHoveringZenButton] = useState(false);

  useEffect(() => {
    if (routedMap?.leafletMap) {
      const map = routedMap.leafletMap.leafletElement;

      const handleMapMove = () => {
        if (isLocationActive && hasFoundLocation) {
          setHasMapMoved(true);
        }
      };

      const handleLocationFound = () => {
        setTimeout(() => {
          setHasFoundLocation(true);
        }, 300);
      };

      map.on("dragend zoomend", handleMapMove);
      map.on("locationfound", handleLocationFound);

      return () => {
        map.off("dragend", handleMapMove);
        map.off("zoomend", handleMapMove);
        map.off("locationfound", handleLocationFound);
      };
    }
  }, [routedMap, isLocationActive, hasFoundLocation]);

  useEffect(() => {
    if (!isLocationActive) {
      setHasMapMoved(false);
      setHasFoundLocation(false);
    }
  }, [isLocationActive]);

  useEffect(() => {
    if (zenMode && !zenButtonHidden && !isHoveringZenButton) {
      const timer = setTimeout(() => {
        setZenButtonHidden(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [zenMode, zenButtonHidden, isHoveringZenButton]);

  // custom hooks

  useAppSearchParams();
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

  const onGazetteerSelection = (selection: SearchResultItem) => {
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
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };

    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  return (
    <ControlLayout>
      {zenMode ? (
        <Control position="topcenter" order={10}>
          <button
            className={`text-xl size-16 hover:text-gray-600 button-shadow bg-white/80 rounded-md transition-all duration-300`}
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
        <div className="pt-16">
          {/* adds padding for topnavbar*/}
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
                    className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                    ref={tourRefLabels.alignNorth}
                    dataTestId="compass-control"
                    disabled={isLeaflet && !showLibreMap}
                  >
                    {showLibreMap ? (
                      <LibrePitchingCompass mapRef={libreMapRef} />
                    ) : (
                      <PitchingCompass />
                    )}
                  </ControlButtonStyler>
                </Tooltip>

                <MapFrameworkSwitcher
                  enableMobileWarning={true}
                  // nativeTooltip={true}
                />

                {
                  // TODO implement cesium home action with generic home control for all mapping engines
                }
              </div>
            </Control>
          )}
          <Control position="topleft" order={20}>
            {showFullscreenButton && (
              <FullscreenControl tourRef={tourRefLabels?.fullScreen} />
            )}
          </Control>
          {showLocatorButton && isMobile && (
            <Control position="topleft" order={30}>
              <RoutedMapLocateControl
                tourRefLabels={tourRefLabels}
                disabled={false}
                nativeTooltip={true}
              />
            </Control>
          )}
          <Control position="topleft" order={40}>
            <Tooltip title="Auf Rathaus Barmen positionieren" placement="right">
              <ControlButtonStyler
                ref={tourRefLabels.home}
                onClick={() => {
                  if (showLibreMap) {
                    if (libreMapRef.current) {
                      libreMapRef.current.flyTo({
                        center: [7.199918031692506, 51.272570027476256],
                        zoom: 17,
                        essential: true,
                      });
                    }
                  } else {
                    routedMap.leafletMap.leafletElement.flyTo(
                      [51.272570027476256, 7.199918031692506],
                      18
                    );
                    homeControl();
                  }
                }}
                dataTestId="home-control"
              >
                <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
              </ControlButtonStyler>
            </Tooltip>
          </Control>
          {!isMobileDevice && (
            <MeasurementControl
              position="topleft"
              order={60}
              disabled={!isLeaflet || (isLeaflet && showLibreMap)}
              useDisabledStyle={isLeaflet && showLibreMap}
              tooltip={
                isCesium
                  ? "zum Messen zu 2D-Modus wechseln"
                  : isModeMeasurement
                  ? "Messungsmodus ausschalten"
                  : "Messungsmodus einschalten"
              }
              tooltipPlacement="right"
              showInfoBox={false}
              ref={tourRefLabels.measurement}
            />
          )}
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
                  setPos(null);
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
          {showLibreMap && (
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
          <Control position="topcenter" order={10}>
            {isLeaflet && <LayerWrapper />}
          </Control>
          <Control position="bottomleft" order={10}>
            <div ref={tourRefLabels.gazetteer} className={`h-full w-full`}>
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
              {isCesium && <ObliqueControls />}
            </>
          )}
        </div>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export default MapWrapper;
