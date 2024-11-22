import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useSearchParams } from "react-router-dom";
import L from "leaflet";

import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  Main,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faInfo,
  faLocationArrow,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import PaleOverlay from "react-cismap/PaleOverlay";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GazetteerHitDisplay from "react-cismap/GazetteerHitDisplay";
import { ProjSingleGeoJson } from "react-cismap/ProjSingleGeoJson";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import {
  replaceHashRoutedHistory,
  useCarmaMapContext,
} from "@carma-apps/portals";
import {
  getCollabedHelpComponentConfig,
  geoElements,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";

import { useTweakpaneCtx } from "@carma-commons/debug";
import {
  detectWebGLContext,
  getApplicationVersion,
} from "@carma-commons/utils";
import {
  OverlayTourContext,
  useOverlayHelper,
} from "@carma-commons/ui/lib-helper-overlay";

import {
  CustomViewer,
  MapTypeSwitcher,
  Compass,
  selectShowPrimaryTileset,
  selectViewerIsMode2d,
  selectViewerModels,
  setIsMode2d,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
  setCurrentSceneStyle,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";

import versionData from "../../../version.json";

import { paramsToObject } from "../../helper/helper.ts";
import { getBackgroundLayers } from "../../helper/layer.tsx";
import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";

import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useGazData } from "../../hooks/useGazData.ts";
import { useWindowSize } from "../../hooks/useWindowSize.ts";
import { useTourRefCollabLabels } from "../../hooks/useTourRefCollabLabels.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";

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
  getFocusMode,
  getLayers,
  getShowFullscreenButton,
  getShowHamburgerMenu,
  getShowLocatorButton,
  getShowMeasurementButton,
} from "../../store/slices/mapping.ts";
import {
  getUIAllow3d,
  getUIMode,
  getUIShowLayerButtons,
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
import "cesium/Build/Cesium/Widgets/widgets.css";

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

export const GeoportalMap = () => {
  const dispatch = useDispatch();

  const location = useLocation();

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
  const showLayerButtons = useSelector(getUIShowLayerButtons);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const focusMode = useSelector(getFocusMode);
  const selectedFeature = useSelector(getSelectedFeature);
  const { viewerRef, terrainProviderRef, surfaceProviderRef } =
    useCesiumContext();
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium();
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

  const { topicMapCtx, setShowTourOverlay } = useCarmaMapContext();

  const {
    routedMapRef: routedMap,
    //realRoutedMapRef: routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon,
  } = topicMapCtx;

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey } = useContext(OverlayTourContext);

  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [isSameLayerTypes, setIsSameLayerTypes] = useState(true);
  const [layoutHeight, setLayoutHeight] = useState(null);
  const [isMeasurementTooltip, setIsMeasurementTooltip] = useState(false);
  const [locationProps, setLocationProps] = useState(0);

  const version = getApplicationVersion(versionData);

  // custom hooks

  useDispatchSachdatenInfoText();

  const tourRefLabels = useTourRefCollabLabels();
  const gazData = useGazData();
  const { width, height } = useWindowSize(wrapperRef);

  const handleToggleMeasurement = () => {
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  };

  const handleToggleFeatureInfo = () => {
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  };

  useFeatureInfoModeCursorStyle();

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

  const renderInfoBox = () => {
    if (isMode2d) {
      if (isModeMeasurement) {
        return <InfoBoxMeasurement key={uiMode} />;
      }
      if (isModeFeatureInfo || selectedFeature) {
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

  // TODO Move out Controls to own component

  console.debug("RENDER: [GEOPORTAL] MAP");
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();
  const [marker, setMarker] = useState(undefined);

  return (
    <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div ref={tourRefLabels.zoom} className="flex flex-col">
          <ControlButtonStyler
            onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
            dataTestId="zoom-in-control"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
            className="!rounded-t-none !border-t-[1px]"
            dataTestId="zoom-out-control"
          >
            <FontAwesomeIcon icon={faMinus} className="text-base" />
          </ControlButtonStyler>
        </div>
      </Control>
      <Control position="topleft" order={20}>
        {showFullscreenButton && (
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
        )}
      </Control>
      <Control position="topleft" order={30}>
        {showLocatorButton && (
          <ControlButtonStyler
            ref={tourRefLabels.navigator}
            onClick={() => setLocationProps((prev) => prev + 1)}
            dataTestId="location-control"
          >
            <FontAwesomeIcon icon={faLocationArrow} className="text-2xl" />
          </ControlButtonStyler>
        )}
        <LocateControlComponent startLocate={locationProps} />
      </Control>
      <Control position="topleft" order={40}>
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
      </Control>
      <Control position="topleft" order={60}>
        {showMeasurementButton && (
          <div className="flex items-center gap-4">
            <Tooltip
              title={
                !isMode2d
                  ? "zum Messen zu 2D-Modus wechseln"
                  : "Strecke / Fläche messen"
              }
              open={isMeasurementTooltip}
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
            //<SceneStyleToggle />
            <Compass ref={tourRefLabels.alignNorth} disabled={isMode2d} />
            // TODO implement cesium home action with generic home control for all mapping engines
            //<HomeControl />
          }
        </Control>
      )}
      <Control position="topleft" order={50}>
        <Tooltip title="Sachdatenabfrage" placement="right">
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
        {showLayerButtons && isMode2d && <LayerWrapper />}
      </Control>
      <Control position="bottomleft" order={10}>
        <div
          ref={tourRefLabels.gazetteer}
          data-test-id="fuzzy-search"
          className="h-full w-full"
        >
          <LibFuzzySearch
            gazData={gazData}
            mapRef={routedMap}
            cesiumViewerRef={viewerRef}
            cesiumOptions={{
              markerAsset,
              markerAnchorHeight,
              isPrimaryStyle: showPrimaryTileset,
              surfaceProviderRef,
              terrainProviderRef,
            }}
            referenceSystem={referenceSystem}
            referenceSystemDefinition={referenceSystemDefinition}
            gazetteerHit={gazetteerHit}
            setGazetteerHit={setGazetteerHit}
            setOverlayFeature={setOverlayFeature}
            placeholder="Wohin?"
          />
        </div>
      </Control>
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
              }}
              onclick={(e) => {
                const map = routedMap.leafletMap.leafletElement;
                if (uiMode === UIMode.FEATURE_INFO) {
                  if (marker !== undefined) {
                    map.removeLayer(marker);
                  }

                  setMarker(
                    L.marker([e.latlng.lat, e.latlng.lng], {
                      icon: L.icon({
                        iconUrl: "crosshair.svg",
                        iconSize: [30, 30],
                      }),
                    }).addTo(map)
                  );
                }
                onClickTopicMap(e, {
                  dispatch,
                  mode: uiMode,
                  store,
                  setPos,
                  zoom: getLeafletZoom(),
                  map: routedMap.leafletMap.leafletElement,
                });
              }}
              gazetteerSearchComponent={<></>}
              infoBox={renderInfoBox()}
              zoomSnap={LEAFLET_CONFIG.zoomSnap}
              zoomDelta={LEAFLET_CONFIG.zoomDelta}
            >
              {backgroundLayer &&
                backgroundLayer.visible &&
                getBackgroundLayers({ layerString: backgroundLayer.layers })}
              {overlayFeature && (
                <ProjSingleGeoJson
                  key={JSON.stringify(overlayFeature)}
                  geoJson={overlayFeature}
                  masked={true}
                  maskingPolygon={maskingPolygon}
                  mapRef={routedMap}
                />
              )}
              <GazetteerHitDisplay
                key={"gazHit" + JSON.stringify(gazetteerHit)}
                gazetteerHit={gazetteerHit}
              />
              {focusMode && <PaleOverlay />}
              {createCismapLayers(layers, {
                focusMode,
                mode: uiMode,
                dispatch,
                setPos,
                zoom: getLeafletZoom(),
              })}
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
                zIndex: 401,
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
        </>
      </Main>
    </ControlLayout>
  );
};

export default GeoportalMap;
