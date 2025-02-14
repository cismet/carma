import { Math as CesiumMath } from "cesium";
import L from "leaflet";
import proj4 from "proj4";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useSearchParams } from "react-router-dom";

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
  faX,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import {
  replaceHashRoutedHistory,
  SelectionMetaData,
  TopicMapSelectionContent,
  useCarmaMapContext,
  useGazData,
  useSelection,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  geoElements,
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";

import { useTweakpaneCtx } from "@carma-commons/debug";
import {
  OverlayTourContext,
  useOverlayHelper,
} from "@carma-commons/ui/lib-helper-overlay";
import {
  detectWebGLContext,
  getApplicationVersion,
} from "@carma-commons/utils";

import {
  CustomViewer,
  MapTypeSwitcher,
  PitchingCompass,
  selectShowPrimaryTileset,
  selectViewerIsMode2d,
  selectViewerModels,
  setCurrentSceneStyle,
  setIsMode2d,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import { SelectionItem } from "libraries/appframeworks/portals/src/lib/components/SelectionProvider.tsx";

import versionData from "../../../version.json";

import { proj4crs3857def, proj4crs4326def } from "../../helper/gisHelper.js";
import { paramsToObject } from "../../helper/helper.ts";
import { getBackgroundLayers } from "../../helper/layer.tsx";
import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";

import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useTourRefCollabLabels } from "../../hooks/useTourRefCollabLabels.ts";
import { useWindowSize } from "../../hooks/useWindowSize.ts";

import store from "../../store/index.ts";
import {
  getSelectedFeature,
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../store/slices/features.ts";
import {
  getBackgroundLayer,
  getLayers,
  getShowFullscreenButton,
  getShowHamburgerMenu,
  getShowLocatorButton,
  getShowMeasurementButton,
} from "../../store/slices/mapping.ts";
import {
  getUIAllow3d,
  getUIMode,
  getZenMode,
  setZenMode,
  toggleUIMode,
  UIMode,
} from "../../store/slices/ui.ts";

import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import LayerWrapper from "../layers/LayerWrapper.tsx";
import InfoBoxMeasurement from "../map-measure/InfoBoxMeasurement.jsx";

import LocateControlComponent from "./controls/LocateControlComponent.tsx";

import { createCismapLayers, onClickTopicMap } from "./topicmap.utils.ts";
import { getUrlPrefix } from "./utils";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";

import "../leaflet.css";
// TODO: move widget css customviewer
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { setDrawingShape } from "../../store/slices/measurements.ts";
import PrintPreview from "../map-print/PrintPreview.tsx";

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

export const GeoportalMap = () => {
  const dispatch = useDispatch();

  const location = useLocation();

  const [numOfLayers, setNumOfLayers] = useState(0);

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const [urlParams, setUrlParams] = useSearchParams();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const allow3d = useSelector(getUIAllow3d) && hasGPU;
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;
  const models = useSelector(selectViewerModels);
  const markerAsset = models[CESIUM_CONFIG.markerKey]; //
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const zenMode = useSelector(getZenMode);
  const selectedFeature = useSelector(getSelectedFeature);
  const {
    viewerRef,
    viewerAnimationMapRef,
    terrainProviderRef,
    surfaceProviderRef,
  } = useCesiumContext();
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(viewerRef, viewerAnimationMapRef);
  const { getLeafletZoom, zoomInLeaflet, zoomOutLeaflet } =
    useLeafletZoomControls();
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

  useOverlayHelper(infoBoxOverlay);
  useOverlayHelper(layerButtonsOverlay);

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

  const { setShowTourOverlay } = useCarmaMapContext();
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey } = useContext(OverlayTourContext);

  const [marker, setMarker] = useState(undefined);
  const [markerAccent, setMarkerAccent] = useState(undefined);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [isSameLayerTypes, setIsSameLayerTypes] = useState(true);
  const [layoutHeight, setLayoutHeight] = useState(null);
  const [isMeasurementTooltip, setIsMeasurementTooltip] = useState(false);
  const [locationProps, setLocationProps] = useState(0);

  const version = getApplicationVersion(versionData);

  // custom hooks

  useDispatchSachdatenInfoText();

  const tourRefLabels = useTourRefCollabLabels();
  const { gazData } = useGazData();
  const { width, height } = useWindowSize(wrapperRef);

  const handleToggleMeasurement = () => {
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  };

  const handleToggleFeatureInfo = () => {
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  };

  useFeatureInfoModeCursorStyle();

  const { setSelection } = useSelection();

  const onComplete = (selection: SelectionItem) => {
    if (
      (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
      !isAreaType(selection.type as ENDPOINT) &&
      isMode2d
    ) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);
      setTimeout(() => {
        const map = routedMap.leafletMap.leafletElement;
        const updatedPos = { lat: selectedPos[1], lng: selectedPos[0] };
        const latlngPoint = L.latLng(updatedPos);

        if (map) {
          map.fireEvent("click", {
            latlng: latlngPoint,
            layerPoint: map.latLngToLayerPoint(latlngPoint),
            containerPoint: map.latLngToContainerPoint(latlngPoint),
          });
        }
      }, 300);
    }
  };

  useSelectionTopicMap({ onComplete });
  useSelectionCesium(
    !isMode2d,
    useMemo(
      () => ({
        markerAsset,
        markerAnchorHeight,
        isPrimaryStyle: showPrimaryTileset,
        surfaceProviderRef,
        terrainProviderRef,
      }),
      [
        markerAsset,
        markerAnchorHeight,
        showPrimaryTileset,
        surfaceProviderRef,
        terrainProviderRef,
      ]
    )
  );

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
    let isSame = true;
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
      if (layer.layerType !== layerType) {
        isSame = false;
      }
    });

    setIsSameLayerTypes(isSame);
  }, [layers]);

  useEffect(() => {
    // TODO wrap this with 3d component in own component?
    // INTIALIZE Cesium Tileset style from Geoportal/TopicMap background later style
    if (viewerRef.current && backgroundLayer) {
      if (backgroundLayer.id === "luftbild") {
        dispatch(setCurrentSceneStyle("primary"));
      } else {
        dispatch(setCurrentSceneStyle("secondary"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);

  useEffect(() => {
    // set 2d mode if allow3d is false or undefined
    if (allow3d === false || allow3d === undefined) {
      dispatch(setIsMode2d(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allow3d]);

  useEffect(() => {
    if (uiMode !== UIMode.FEATURE_INFO && marker !== undefined) {
      routedMap.leafletMap.leafletElement.removeLayer(marker);
      routedMap.leafletMap.leafletElement.removeLayer(markerAccent);
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      setPos(null);
      dispatch(setPreferredLayerId(""));
    }
  }, [uiMode]);

  const renderInfoBox = () => {
    if (isMode2d) {
      if (isModeMeasurement) {
        return <InfoBoxMeasurement key={uiMode} />;
      }
      if (selectedFeature) {
        return <FeatureInfoBox pos={pos} />;
      }
    }
    return <div></div>;
  };

  const showOverlayFromOutside = (key: string) => {
    setAppMenuVisible(false);
    setSecondaryWithKey(key);
    setShowTourOverlay(true);
  };

  const updateFeatureInfo = () => {
    setTimeout(() => {
      const map = routedMap.leafletMap.leafletElement;
      const latlngPoint = L.latLng(pos);
      map.fireEvent("click", {
        latlng: latlngPoint,
        layerPoint: map.latLngToLayerPoint(latlngPoint),
        containerPoint: map.latLngToContainerPoint(latlngPoint),
      });
    }, 150);
  };

  // TODO Move out Controls to own component

  console.debug("RENDER: [GEOPORTAL] MAP", isMode2d);
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  useEffect(() => {
    if (isModeFeatureInfo && pos) {
      updateFeatureInfo();
    }
    setNumOfLayers(layers.length);
  }, [layers]);

  return (
    <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
      {zenMode ? (
        <>
          <Control position="topleft" order={10}>
            <ControlButtonStyler
              onClick={() => {
                dispatch(setZenMode(false));
              }}
              dataTestId="close-zen-mode-control"
            >
              <FontAwesomeIcon icon={faX} />
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
                  className={`!rounded-t-none !border-t-[1px] ${
                    allow3d && "!rounded-b-none !border-b-0"
                  }`}
                  dataTestId="zoom-out-control"
                >
                  <FontAwesomeIcon icon={faMinus} className="text-base" />
                </ControlButtonStyler>
              </Tooltip>
              {allow3d && (
                <Tooltip title="Nach Norden ausrichten" placement="right">
                  <ControlButtonStyler
                    useDisabledStyle={false}
                    className="!rounded-t-none !border-t-[1px]"
                    ref={tourRefLabels.alignNorth}
                    dataTestId="compass-control"
                    disabled={isMode2d}
                  >
                    <PitchingCompass
                      viewerRef={viewerRef}
                      viewerAnimationMapRef={viewerAnimationMapRef}
                      maxPitch={CesiumMath.toRadians(-30)}
                    />
                  </ControlButtonStyler>
                </Tooltip>
              )}
            </div>
          </Control>
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
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                    } else {
                      document.documentElement.requestFullscreen();
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
                title="Modus Standortanzeige einschalten"
                placement="right"
              >
                <ControlButtonStyler
                  ref={tourRefLabels.navigator}
                  onClick={() => setLocationProps((prev) => prev + 1)}
                  dataTestId="location-control"
                >
                  <FontAwesomeIcon
                    icon={faLocationArrow}
                    className="text-2xl"
                  />
                </ControlButtonStyler>
              </Tooltip>
            )}
            <LocateControlComponent startLocate={locationProps} />
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
          {allow3d && (
            <Control position="topleft" order={70}>
              <MapTypeSwitcher
                duration={CESIUM_CONFIG.transitions.mapMode.duration}
                onComplete={(isTo2d: boolean) => {
                  //dispatch(setBackgroundLayer({ ...backgroundLayer, visible: isTo2d }));
                }}
                ref={tourRefLabels.toggle2d3d}
              />
              {
                // TODO implement cesium home action with generic home control for all mapping engines
              }
            </Control>
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
                disabled={!isMode2d}
                onClick={() => {
                  handleToggleFeatureInfo();
                  dispatch(setSelectedFeature(null));
                  dispatch(setSecondaryInfoBoxElements([]));
                  dispatch(setFeatures([]));
                  setPos(null);
                  dispatch(setPreferredLayerId(""));
                  if (marker !== undefined) {
                    routedMap.leafletMap.leafletElement.removeLayer(marker);
                  }
                  if (markerAccent !== undefined) {
                    routedMap.leafletMap.leafletElement.removeLayer(
                      markerAccent
                    );
                  }
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
                //referenceSystem={referenceSystem}
                //referenceSystemDefinition={referenceSystemDefinition}
                onSelection={onGazetteerSelection}
                placeholder="Wohin?"
              />
            </div>
          </Control>
        </>
      )}
      <Main ref={wrapperRef}>
        <>
          <div className={"map-container-2d"} style={{ zIndex: 400 }}>
            <TopicMapComponent
              gazData={gazData}
              modalMenu={
                <GenericModalApplicationMenu
                  {...getCollabedHelpComponentConfig({
                    versionString: version,
                    showOverlayFromOutside: showOverlayFromOutside,
                  })}
                />
              }
              applicationMenuTooltipString={tooltipText}
              hamburgerMenu={showHamburgerMenu}
              locatorControl={false}
              fullScreenControl={false}
              zoomControls={false}
              mapStyle={{ width, height }}
              leafletMapProps={{ editable: true }}
              minZoom={10}
              backgroundlayers="empty"
              mappingBoundsChanged={(boundingbox) => {
                // console.debug('xxx bbox', createWMSBbox(boundingbox));
              }}
              locationChangedHandler={(location) => {
                const newParams = { ...paramsToObject(urlParams), ...location };
                setUrlParams(newParams);
                if (
                  location.zoom.toString() !==
                    urlParams.get("zoom").toString() &&
                  isModeFeatureInfo
                ) {
                  updateFeatureInfo();
                }
              }}
              onclick={(e) => {
                const map = routedMap.leafletMap.leafletElement;
                const baseUrl =
                  window.location.origin + window.location.pathname;

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
                });
              }}
              gazetteerSearchControl={false}
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

              {createCismapLayers(layers, {
                mode: uiMode,
                dispatch,
                zoom: getLeafletZoom(),
                selectedFeature,
              })}
              <PrintPreview />
            </TopicMapComponent>
          </div>
          {allow3d && (
            <div
              ref={container3dMapRef}
              className={"map-container-3d"}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 400,
                opacity: isMode2d ? 0 : 1,
                transition: `opacity ${CESIUM_CONFIG.transitions.mapMode.duration}ms ease-in-out`,
                pointerEvents: isMode2d ? "none" : "auto",
              }}
            >
              <CustomViewer
                containerRef={container3dMapRef}
                cameraOptions={CESIUM_CONFIG.camera}
                onSceneChange={(e) => {
                  console.debug(
                    "[GEOPORTALMAP|HASH|SCENE|CESIUM]cesium scene changed",
                    e
                  );
                  replaceHashRoutedHistory(e, location.pathname);
                }}
              ></CustomViewer>
            </div>
          )}
          {/* <CssXorLine /> */}
        </>
      </Main>
    </ControlLayout>
  );
};

export default GeoportalMap;
const CssXorLine = () => {
  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        width: "200px",
        height: "10px",
        backgroundColor: "white", // Base color of the line
        mixBlendMode: "difference", // Blend mode to achieve XOR-like contrast
        transform: "translate(-50%, -50%)", // Center the line
        zIndex: 999999999,
        pointerEvents: "none", // Ensure it doesn’t block interactions
      }}
    ></div>
  );
};
