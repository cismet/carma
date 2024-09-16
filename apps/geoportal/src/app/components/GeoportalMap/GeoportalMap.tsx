import { useContext, useEffect, useRef, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { useDispatch, useSelector } from "react-redux";
import { paramsToObject } from "../../helper/helper.ts";
import {
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getShowFullscreenButton,
  getShowHamburgerMenu,
  getShowLocatorButton,
  getShowMeasurementButton,
  setStartDrawing,
} from "../../store/slices/mapping.ts";
import {
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import versionData from "../../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import LayerWrapper from "../layers/LayerWrapper.tsx";
import InfoBoxMeasurement from "../map-measure/InfoBoxMeasurement.jsx";
import PaleOverlay from "react-cismap/PaleOverlay";
import { useSearchParams } from "react-router-dom";
import { getBackgroundLayers } from "../../helper/layer.tsx";
import {
  getUIAllow3d,
  getUIMode,
  getUIShowLayerButtons,
  toggleUIMode,
  UIMode,
} from "../../store/slices/ui.ts";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  Main,
} from "@carma-mapping/map-controls-layout";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
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
import "../leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

import {
  CustomViewer,
  MapTypeSwitcher,
  Compass,
  useCesiumCustomViewer,
  setIsMode2d,
  useHomeControl,
  useViewerIsMode2d,
  useSceneStyleToggle,
  useZoomControls,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import GazetteerHitDisplay from "react-cismap/GazetteerHitDisplay";
import { ProjSingleGeoJson } from "react-cismap/ProjSingleGeoJson";
import { TweakpaneProvider } from "@carma-commons/debug";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { Tooltip } from "antd";
import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import { ExtraMarker } from "react-cismap/ExtraMarker";

import {
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../store/slices/features.ts";
import store from "../../store/index.ts";
import LocateControlComponent from "./controls/LocateControlComponent.tsx";
import { getUrlPrefix } from "./utils";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { createCismapLayers, onClickTopicMap } from "./topicmap.utils.ts";
import { useGazData } from "../../hooks/useGazData.ts";
import { useWindowSize } from "../../hooks/useWindowSize.ts";
import { useTourRefCollabLabels } from "../../hooks/useTourRefCollabLabels.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";

// TODO: Make transition style configurable with config and cesium library
const MAPMODE_TRANSITION_DURATION = 1000;

export const GeoportalMap = () => {
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const allow3d = useSelector(getUIAllow3d);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isMode2d = useViewerIsMode2d();
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
  const { viewer } = useCesiumCustomViewer();
  const homeControl = useHomeControl();
  const { handleZoomIn, handleZoomOut } = useZoomControls();
  const toggleSceneStyle = useSceneStyleToggle();

  const {
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon,
  } = useContext<typeof TopicMapContext>(TopicMapContext);

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

  return (
    <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div ref={tourRefLabels.zoom} className="flex flex-col">
          <ControlButtonStyler
            onClick={(e) => {
              // TODO Check for side effects of this while animating
              isMode2d && routedMapRef.leafletMap.leafletElement.zoomIn();
              !isMode2d && handleZoomIn(e);
            }}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={(e) => {
              isMode2d && routedMapRef.leafletMap.leafletElement.zoomOut();
              !isMode2d && handleZoomOut(e);
            }}
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
            routedMapRef.leafletMap.leafletElement.flyTo(
              [51.272570027476256, 7.199918031692506],
              18,
            );
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
        <Control position="topleft" order={60}>
          <MapTypeSwitcher />
          {
            //<SceneStyleToggle />
            <Compass disabled={isMode2d} />
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
          <LibFuzzySearch
            gazData={gazData}
            mapRef={routedMapRef}
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
          <div className={"map-container-2d"} style={{ zIndex: 100 }}>
            <TopicMapComponent
              gazData={gazData}
              modalMenu={
                <GenericModalApplicationMenu
                  {...getCollabedHelpComponentConfig({
                    versionString: version,
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
              minZoom={5}
              backgroundlayers="empty"
              mappingBoundsChanged={(boundingbox) => {
                // console.log('xxx bbox', createWMSBbox(boundingbox));
              }}
              locationChangedHandler={(location) => {
                const newParams = { ...paramsToObject(urlParams), ...location };
                setUrlParams(newParams);
              }}
              onclick={(e) =>
                onClickTopicMap(e, { dispatch, mode: uiMode, store, setPos })
              }
              gazetteerSearchComponent={<></>}
              infoBox={
                isModeMeasurement ? (
                  <InfoBoxMeasurement key={uiMode} />
                ) : isModeFeatureInfo ? (
                  <FeatureInfoBox />
                ) : (
                  <div></div>
                )
              }
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
                  mapRef={routedMapRef}
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
              })}
              {pos && isModeFeatureInfo && layers.length > 0 && (
                <ExtraMarker
                  markerOptions={{ markerColor: "cyan", spin: false }}
                  position={pos}
                />
              )}
            </TopicMapComponent>
          </div>
          {allow3d && (
            <TweakpaneProvider>
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
                  transition: `opacity ${MAPMODE_TRANSITION_DURATION}ms ease-in-out`,
                  pointerEvents: isMode2d ? "none" : "auto",
                }}
              >
                <CustomViewer
                  containerRef={container3dMapRef}
                  enableLocationHashUpdate={false}
                ></CustomViewer>
              </div>
            </TweakpaneProvider>
          )}
        </>
      </Main>
    </ControlLayout>
  );
};

export default GeoportalMap;