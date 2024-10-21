import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

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

import {
  geoElements,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/helper-overlay";

import { useTweakpaneCtx, useValueChange } from "@carma-commons/debug";
import { getApplicationVersion } from "@carma-commons/utils";
import { useOverlayHelper } from "@carma-commons/ui/lib-helper-overlay";

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
  useSceneStyleToggle,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";

import versionData from "../../../version.json";

import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";

import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useGazDataRef } from "../../hooks/useGazDataRef.ts";
import { useTourRefCollabLabels } from "../../hooks/useTourRefCollabLabels.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";

import {
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../store/slices/features.ts";
import {
  getBackgroundLayer,
  getLayers,
  getShowFullscreenButton,
  getShowLocatorButton,
  getShowMeasurementButton,
  setBackgroundLayer,
} from "../../store/slices/mapping.ts";
import {
  getLeafletElement,
  getReferenceSystem,
  getReferenceSystemDefinition,
} from "../../store/slices/topicmap";

import {
  getUIAllow3d,
  getUIMode,
  getUIShowLayerButtons,
  toggleUIMode,
  UIMode,
} from "../../store/slices/ui.ts";

import LayerWrapper from "../layers/LayerWrapper.tsx";
import LocateControlComponent from "./controls/LocateControlComponent.tsx";
import { TopicMapWrapper } from "./TopicMapWrapper.tsx";

import { getUrlPrefix } from "./utils";

import { CESIUM_CONFIG, COMMON_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";

import "../leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

// TODO remove counter once rerenders are under control
let rerenderCount: number = 0;
let lastRenderTimeStamp: number = Date.now();
let lastRenderInterval: number = 0;

// TODO remove this once rerenders are under control in cesium
const enableTopicMap = false;

export const GeoportalMap = () => {
  const dispatch = useDispatch();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const allow3d = useSelector(getUIAllow3d);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isMode2d = useSelector(selectViewerIsMode2d);
  const models = useSelector(selectViewerModels);
  const markerAsset = models[CESIUM_CONFIG.markerKey]; //
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;

  const leafletElement = useSelector(getLeafletElement);
  const referenceSystem = useSelector(getReferenceSystem);
  const referenceSystemDefinition = useSelector(getReferenceSystemDefinition);

  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showLayerButtons = useSelector(getUIShowLayerButtons);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const showPrimaryTileset = useSelector(selectShowPrimaryTileset);

  // TODO make sure store is fully loaded before rendering outside of component
  const isStoreUndefined = allow3d === undefined || isMode2d === undefined;

  const { viewer, terrainProvider, surfaceProvider } = useCesiumContext();
  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium();
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();
  const toggleSceneStyle = useSceneStyleToggle();

  const infoBoxOverlay = useMemo(() => {
    return addCssToOverlayHelperItem(
      getCollabedHelpComponentConfig("INFOBOX", geoElements),
      "350px",
      "137px"
    );
  }, []);

  useOverlayHelper(infoBoxOverlay);

  useTweakpaneCtx(
    {
      title: "GeoportalMap",
    },
    {
      rerenderCount,
      lastRenderInterval,
      dpr: window.devicePixelRatio,
      resolutionScale: viewer ? viewer.resolutionScale : 0,
    },
    [
      { name: "rerenderCount", readonly: true, format: (v) => v.toFixed(0) },
      {
        name: "lastRenderInterval",
        readonly: true,
        format: (v) => v.toFixed(0),
      },
      { name: "dpr", readonly: true, format: (v) => v.toFixed(1) },
      { name: "resolutionScale", readonly: true, format: (v) => v.toFixed(1) },
    ],
  );

  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [isSameLayerTypes, setIsSameLayerTypes] = useState(true);
  const [isMeasurementTooltip, setIsMeasurementTooltip] = useState(false);
  const [locationProps, setLocationProps] = useState(0);

  const version = getApplicationVersion(versionData);

  // custom hooks

  useDispatchSachdatenInfoText();

  const tourRefLabels = useTourRefCollabLabels();
  const gazDataRef = useGazDataRef();

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
  }, [layers, dispatch]);

  useEffect(() => {
    // TODO wrap this with 3d component in own component?
    // INTIALIZE Cesium Tileset style from Geoportal/TopicMap background later style
    if (viewer && backgroundLayer) {
      if (backgroundLayer.id === "luftbild") {
        toggleSceneStyle("primary");
      } else {
        toggleSceneStyle("secondary");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, backgroundLayer]);

  useEffect(() => {
    // set 2d mode if allow3d is false or undefined
    if (allow3d === false || allow3d === undefined) {
      dispatch(setIsMode2d(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allow3d]);

  // TODO Move out Controls to own component

  useValueChange(allow3d, "allow3d");
  useValueChange(isMode2d, "isMode2d");
  useValueChange(backgroundLayer, "backgroundLayer");
  useValueChange(showFullscreenButton, "showFullscreenButton");
  useValueChange(showLocatorButton, "showLocatorButton");
  useValueChange(showMeasurementButton, "showMeasurementButton");
  useValueChange(showLayerButtons, "showLayerButtons");
  useValueChange(showPrimaryTileset, "showPrimaryTileset");
  useValueChange(isModeMeasurement, "isModeMeasurement");
  useValueChange(isModeFeatureInfo, "isModeFeatureInfo");
  useValueChange(layers, "layers");
  useValueChange(backgroundLayer, "backgroundLayer");
  useValueChange(referenceSystem, "referenceSystem");
  useValueChange(referenceSystemDefinition, "referenceSystemDefinition");
  useValueChange(leafletElement, "leafletElement");
  useValueChange(viewer, "viewer");
  useValueChange(terrainProvider, "terrainProvider");
  useValueChange(surfaceProvider, "surfaceProvider");
  useValueChange(homeControl, "homeControl");
  useValueChange(handleZoomInCesium, "handleZoomInCesium");
  useValueChange(handleZoomOutCesium, "handleZoomOutCesium");
  useValueChange(zoomInLeaflet, "zoomInLeaflet");
  useValueChange(zoomOutLeaflet, "zoomOutLeaflet");
  useValueChange(toggleSceneStyle, "toggleSceneStyle");
  useValueChange(infoBoxOverlay, "infoBoxOverlay");
  useValueChange(gazDataRef.current, "gazData");
  useValueChange(gazetteerHit, "gazetteerHit");
  useValueChange(overlayFeature, "overlayFeature");
  useValueChange(pos, "pos");
  useValueChange(isSameLayerTypes, "isSameLayerTypes");
  useValueChange(isMeasurementTooltip, "isMeasurementTooltip");
  useValueChange(locationProps, "locationProps");
  useValueChange(version, "version");

  const flyToLeafletHome = useCallback(() => {
    leafletElement &&
      leafletElement.flyTo(COMMON_CONFIG.homePosition, COMMON_CONFIG.homeZoom);
  }, [leafletElement]);

  const handleToggleMeasurement = useCallback(() => {
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  }, [dispatch]);

  const handleToggleFeatureInfo = useCallback(() => {
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  }, [dispatch]);

  console.info("RENDER: [GEOPORTAL] MAP");
  rerenderCount++;
  lastRenderInterval = Date.now() - lastRenderTimeStamp;
  lastRenderTimeStamp = Date.now();

  return (
    <ControlLayout ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div ref={tourRefLabels.zoom} className="flex flex-col">
          <ControlButtonStyler
            onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
            className="!rounded-t-none !border-t-[1px]"
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
            flyToLeafletHome();
            homeControl();
          }}
        >
          <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
        </ControlButtonStyler>
      </Control>
      <Control position="topleft" order={50}>
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
              >
                <img
                  src={`${getUrlPrefix()}${isModeMeasurement ? "measure-active.png" : "measure.png"
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
        <Control position="topleft" order={60}>
          <MapTypeSwitcher
            leafletElement={leafletElement}
            duration={CESIUM_CONFIG.transitions.mapMode.duration}
            onComplete={(isTo2d: boolean) => {
              dispatch(
                setBackgroundLayer({ ...backgroundLayer, visible: isTo2d }),
              );
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
      <Control position="topleft" order={60}>
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
            }}
            className="font-semibold"
            ref={tourRefLabels.featureInfo}
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
        <div ref={tourRefLabels.gazetteer} className="h-full w-full">
          {leafletElement && (
            <LibFuzzySearch
              gazData={gazDataRef.current}
              leafletElement={leafletElement}
              cesiumOptions={{
                viewer,
                markerAsset,
                markerAnchorHeight,
                isPrimaryStyle: showPrimaryTileset,
                surfaceProvider,
                terrainProvider,
              }}
              referenceSystem={referenceSystem}
              referenceSystemDefinition={referenceSystemDefinition}
              gazetteerHit={gazetteerHit}
              setGazetteerHit={setGazetteerHit}
              setOverlayFeature={setOverlayFeature}
              placeholder="Wohin?"
            />
          )}
        </div>
      </Control>
      <Main ref={wrapperRef}>
        <>
          {enableTopicMap && <TopicMapWrapper
            backgroundLayer={backgroundLayer}
            gazData={gazDataRef.current}
            gazetteerHit={gazetteerHit}
            layers={layers}
            leafletConfig={LEAFLET_CONFIG}
            overlayFeature={overlayFeature}
            pos={pos}
            setPos={setPos}
            tooltipText={tooltipText}
            version={version}
            wrapperRef={wrapperRef}
          />}
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
                minPitch={CESIUM_CONFIG.camera.minPitch}
                minPitchRange={CESIUM_CONFIG.camera.minPitchRange}
              ></CustomViewer>
            </div>
          )}
        </>
      </Main>
    </ControlLayout>
  );
};

export default GeoportalMap;
