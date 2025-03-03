import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { useDispatch, useSelector } from "react-redux";

import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  Main,
} from "@carma-mapping/map-controls-layout";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faInfo,
  faLocationArrow,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  SelectionMetaData,
  useGazData,
  useSelection,
} from "@carma-apps/portals";

import { useTweakpaneCtx } from "@carma-commons/debug";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import { detectWebGLContext } from "@carma-commons/utils";

import {
  MapTypeSwitcher,
  PitchingCompass,
  selectViewerIsMode2d,
  selectViewerModels,
  setIsMode2d,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import {
  FullScreenDocument,
  FullScreenHTMLElement,
} from "@carma-mapping/layers";

import { GeoportalMap } from "../GeoportalMap.tsx";
import LayerWrapper from "../../layers/LayerWrapper.tsx";
import LocateControlComponent from "../controls/LocateControlComponent.tsx";

import { ObliqueImageInfoContainer } from "../../../oblique/components/ObliqueImageInfoContainer.tsx";

import useLeafletZoomControls from "../../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useTourRefCollabLabels } from "../../../hooks/useTourRefCollabLabels.ts";
import { useWindowSize } from "../../../hooks/useWindowSize.ts";

import {
  exitFullscreen,
  getUrlPrefix,
  isFullscreen,
  requestFullscreen,
} from "../utils";
import { cancelOngoingRequests } from "../topicmap.utils";

import {
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../../store/slices/features.ts";
import {
  getShowFullscreenButton,
  getShowLocatorButton,
  getShowMeasurementButton,
} from "../../../store/slices/mapping.ts";
import { setDrawingShape } from "../../../store/slices/measurements.ts";
import {
  getUIAllow3d,
  getUIMode,
  getZenMode,
  setZenMode,
  toggleUIMode,
  UIMode,
} from "../../../store/slices/ui.ts";

import { CESIUM_CONFIG } from "../../../config/app.config";

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

const MapWrapper = () => {
  const dispatch = useDispatch();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const allow3d = useSelector(getUIAllow3d) && hasGPU;
  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;
  const models = useSelector(selectViewerModels);
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const zenMode = useSelector(getZenMode);
  const { viewerRef, viewerAnimationMapRef } = useCesiumContext();
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(viewerRef, viewerAnimationMapRef);
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "GeoportalMap",
        },
        params: {
          get renderCount() {
            return rerenderCountRef.current;
          },
          get renderInterval() {
            return lastRenderIntervalRef.current;
          },
          dpr: window.devicePixelRatio,
          resolutionScale: viewerRef.current
            ? viewerRef.current.resolutionScale
            : 0,
        },
        inputs: [
          { name: "renderCount", readonly: true, format: (v) => v.toFixed(0) },
          {
            name: "renderInterval",
            readonly: true,
            format: (v) => v.toFixed(0),
          },
          { name: "dpr", readonly: true, format: (v) => v.toFixed(1) },
          {
            name: "resolutionScale",
            readonly: true,
            format: (v) => v.toFixed(1),
          },
        ],
      }),
      [viewerRef, rerenderCountRef]
    )
  );

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const [pos, setPos] = useState<[number, number] | null>(null);
  const [layoutHeight, setLayoutHeight] = useState(null);
  const [isMeasurementTooltip, setIsMeasurementTooltip] = useState(false);
  const [isLocationActive, setIsLocationActive] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [hasFoundLocation, setHasFoundLocation] = useState(false);

  useEffect(() => {
    if (routedMap) {
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

      map.on("move", handleMapMove);
      map.on("locationfound", handleLocationFound);

      return () => {
        map.off("move", handleMapMove);
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

  // custom hooks

  useDispatchSachdatenInfoText();

  const tourRefLabels = useTourRefCollabLabels();
  const { gazData } = useGazData();
  const { width, height } = useWindowSize(wrapperRef);

  const handleToggleMeasurement = () => {
    cancelOngoingRequests();
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  };

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
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };

    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  useEffect(() => {
    // set 2d mode if allow3d is false or undefined
    if (allow3d === false || allow3d === undefined) {
      dispatch(setIsMode2d(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allow3d]);

  console.debug("RENDER: [WRAPPER] MAP", isMode2d);
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  return (
    <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
      {zenMode ? (
        <>
          <Control position="topleft" order={10}>
            <ControlButtonStyler
              onClick={() => {
                dispatch(setZenMode(false));
              }}
              width="128px"
              fontSize="12px"
              dataTestId="close-zen-mode-control"
            >
              <span className="font-medium">Zen-Modus verlassen</span>
            </ControlButtonStyler>
          </Control>
        </>
      ) : (
        <>
          <Control position="topleft" order={10}>
            <div ref={tourRefLabels.zoom} className="flex flex-col">
              <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
                <ControlButtonStyler
                  onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
                  className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                  dataTestId="zoom-in-control"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-base" />
                </ControlButtonStyler>
              </Tooltip>
              <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
                <ControlButtonStyler
                  onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
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
                    disabled={isMode2d}
                  >
                    <PitchingCompass
                      viewerRef={viewerRef}
                      viewerAnimationMapRef={viewerAnimationMapRef}
                    />
                  </ControlButtonStyler>
                </Tooltip>
                <Control position="topleft" order={70}>
                  <MapTypeSwitcher
                    duration={CESIUM_CONFIG.transitions.mapMode.duration}
                    className="!rounded-t-none !border-t-[1px]"
                    onComplete={(isTo2d: boolean) => {
                      //dispatch(setBackgroundLayer({ ...backgroundLayer, visible: isTo2d }));
                    }}
                    ref={tourRefLabels.toggle2d3d}
                  />
                  {
                    // TODO implement cesium home action with generic home control for all mapping engines
                  }
                </Control>
              </div>
            </Control>
          )}

          <Control position="topleft" order={20}>
            {showFullscreenButton && (
              <Tooltip
                title={
                  document.fullscreenElement
                    ? "Vollbildmodus ausschalten"
                    : "Vollbildmodus einschalten"
                }
                placement="right"
              >
                <ControlButtonStyler
                  onClick={() => {
                    const doc = document as FullScreenDocument;
                    if (isFullscreen(doc)) {
                      exitFullscreen(doc);
                    } else {
                      requestFullscreen(
                        document.documentElement as FullScreenHTMLElement
                      );
                    }
                  }}
                  ref={tourRefLabels.fullScreen}
                  dataTestId="full-screen-control"
                >
                  <FontAwesomeIcon
                    icon={document.fullscreenElement ? faCompress : faExpand}
                  />
                </ControlButtonStyler>
              </Tooltip>
            )}
          </Control>
          <Control position="topleft" order={30}>
            {showLocatorButton && isMobile && (
              <Tooltip
                title={
                  isLocationActive
                    ? "Standortanzeige ausschalten"
                    : "Standortanzeige einschalten"
                }
                placement="right"
              >
                <ControlButtonStyler
                  ref={tourRefLabels.navigator}
                  onClick={() => setIsLocationActive((prev) => !prev)}
                  dataTestId="location-control"
                >
                  <FontAwesomeIcon
                    icon={faLocationArrow}
                    className={`text-2xl ${
                      isLocationActive
                        ? hasMapMoved
                          ? "text-blue-500"
                          : "text-orange-500"
                        : ""
                    }`}
                  />
                </ControlButtonStyler>
              </Tooltip>
            )}
            <LocateControlComponent isActive={isLocationActive} />
          </Control>
          <Control position="topleft" order={40}>
            <Tooltip title="Auf Ausgangspunkt positionieren" placement="right">
              <ControlButtonStyler
                ref={tourRefLabels.home}
                onClick={() => {
                  routedMap.leafletMap.leafletElement.flyTo(
                    [51.272570027476256, 7.199918031692506],
                    18
                  );
                  homeControl();
                }}
                dataTestId="home-control"
              >
                <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
              </ControlButtonStyler>
            </Tooltip>
          </Control>
          <Control position="topleft" order={60}>
            {showMeasurementButton && (
              <div className="flex items-center gap-4">
                <Tooltip
                  title={
                    !isMode2d
                      ? "zum Messen zu 2D-Modus wechseln"
                      : isModeMeasurement
                      ? "Messungsmodus ausschalten"
                      : "Messungsmodus einschalten"
                  }
                  // open={isMeasurementTooltip}
                  defaultOpen={false}
                  onOpenChange={() => {
                    if (isModeMeasurement) {
                      setIsMeasurementTooltip(false);
                    } else {
                      setIsMeasurementTooltip(!isMeasurementTooltip);
                    }
                  }}
                  placement="right"
                >
                  <ControlButtonStyler
                    disabled={!isMode2d}
                    onClick={() => {
                      if (!isModeMeasurement) {
                        dispatch(setDrawingShape(false));
                      }
                      setIsMeasurementTooltip(false);
                      handleToggleMeasurement();
                    }}
                    ref={tourRefLabels.measurement}
                    dataTestId="measurement-control"
                  >
                    <img
                      src={`${getUrlPrefix()}${
                        isModeMeasurement ? "measure-active.png" : "measure.png"
                      }`}
                      alt="Measure"
                      className="w-6"
                    />
                  </ControlButtonStyler>
                </Tooltip>
              </div>
            )}
          </Control>
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
                disabled={!isMode2d}
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
          <Control position="topcenter" order={10}>
            {isMode2d && <LayerWrapper />}
          </Control>
          <Control position="bottomleft" order={10}>
            <div
              ref={tourRefLabels.gazetteer}
              data-test-id="fuzzy-search"
              className="h-full w-full"
            >
              <LibFuzzySearch
                gazData={gazData}
                onSelection={onGazetteerSelection}
                placeholder="Wohin?"
              />
            </div>
          </Control>
        </>
      )}
      <Main ref={wrapperRef}>
        <div
          id="mapContainer"
          className={`${isMobile ? "h-0" : ""} flex flex-1 relative`}
        >
          <GeoportalMap height={height} width={width} allow3d={allow3d} />
          <ObliqueImageInfoContainer />
        </div>
      </Main>
    </ControlLayout>
  );
};

export default MapWrapper;
