import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { useDispatch, useSelector } from "react-redux";
import { getGazData, paramsToObject } from "../helper/helper.ts";
import {
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getShowFullscreenButton,
  getShowHamburgerMenu,
  getShowLocatorButton,
  getShowMeasurementButton,
  setStartDrawing,
} from "../store/slices/mapping.ts";
import {
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import LayerWrapper from "./layers/LayerWrapper.tsx";
import InfoBoxMeasurement from "./map-measure/InfoBoxMeasurement.jsx";
import PaleOverlay from "react-cismap/PaleOverlay";
import { useSearchParams } from "react-router-dom";
import { getBackgroundLayers } from "../helper/layer.tsx";
import { getAllow3d, getMode, getShowLayerButtons, setMode } from "../store/slices/ui.ts";
import CismapLayer from "react-cismap/CismapLayer";
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
  faLocationArrow,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import type LocateControl from "leaflet.locatecontrol";
import "./leaflet.css";
import { CustomViewer, CustomViewerContextProvider } from "@carma-mapping/cesium-engine";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import GazetteerHitDisplay from "react-cismap/GazetteerHitDisplay";
import { ProjSingleGeoJson } from "react-cismap/ProjSingleGeoJson";
import { defaultViewerState } from "../config/store.config.ts";
import { BASEMAP_METROPOLRUHR_WMS_GRAUBLAU, WUPP_TERRAIN_PROVIDER } from "../config/dataSources.config.ts";
import { MODEL_ASSETS } from "../config/assets.config.ts";
import { TweakpaneProvider } from "@carma-commons/debug";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { Tooltip } from "antd";

enum MapMode {
  _2D = "2D",
  _3D = "3D",
}

const getMapModeButtonLabel = (mode: MapMode) => {
  // returns the opposite of the current mode
  switch (mode) {
    case MapMode._2D:
      return "3D";
    case MapMode._3D:
      return "2D";
  }
};

export const GeoportalMap = () => {
  const [gazData, setGazData] = useState([]);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const allow3d = useSelector(getAllow3d);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const mode = useSelector(getMode);
  const showLayerButtons = useSelector(getShowLayerButtons);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const focusMode = useSelector(getFocusMode);
  const [urlParams, setUrlParams] = useSearchParams();
  const [layoutHeight, setLayoutHeight] = useState(null);
  const {
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon,
  } = useContext<typeof TopicMapContext>(TopicMapContext);
  const [locationProps, setLocationProps] = useState(0);
  const [mapMode, setMapMode] = useState<MapMode>(MapMode._2D);
  const urlPrefix = window.location.origin + window.location.pathname;

  const toggleMapMode = useCallback(() => {
    setMapMode(prevMode => prevMode === MapMode._2D ? MapMode._3D : MapMode._2D);
  }, []);
  const version = getApplicationVersion(versionData);
  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        setHeight(wrapperRef.current.clientHeight);
        setWidth(wrapperRef.current.clientWidth);
        console.log(
          "xxx resize",
          wrapperRef.current.clientHeight,
          wrapperRef.current.clientWidth,
        );
      }
    };

    window.addEventListener("resize", handleResize);

    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  console.log("xxx Render Geoportal", gazetteerHit);

  return (
    <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div className="flex flex-col">
          <ControlButtonStyler
            onClick={() => {
              routedMapRef.leafletMap.leafletElement.zoomIn();
            }}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={() => {
              routedMapRef.leafletMap.leafletElement.zoomOut();
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
            onClick={() => setLocationProps((prev) => prev + 1)}
          >
            <FontAwesomeIcon icon={faLocationArrow} className="text-2xl" />
          </ControlButtonStyler>
        )}
        <LocateControlComponent startLocate={locationProps} />
      </Control>
      <Control position="topleft" order={40}>
        <ControlButtonStyler
          onClick={() =>
            routedMapRef.leafletMap.leafletElement.flyTo(
              [51.272570027476256, 7.199918031692506],
              18,
            )
          }
        >
          <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
        </ControlButtonStyler>
      </Control>
      <Control position="topleft" order={50}>
        {showMeasurementButton && (
          <div className="flex items-center gap-4">
            <Tooltip title="Strecke / Fläche messen" placement="right">
              <ControlButtonStyler
                onClick={() => {
                  dispatch(
                    setMode(mode === "measurement" ? "default" : "measurement"),
                  );
                }}
              >
                <img
                  src={`${urlPrefix}${mode === "measurement"
                      ? "measure-active.png"
                      : "measure.png"
                    }`
                  }
                  alt="Measure"
                  className="w-6"
                />
              </ControlButtonStyler>
            </Tooltip>
            {mode === "measurement" && (
              <Tooltip title="Neue Messung" placement="right">
                <ControlButtonStyler
                  onClick={() => {
                    dispatch(setStartDrawing(true));
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} />
                </ControlButtonStyler>
              </Tooltip>
            )}
          </div>
        )}
      </Control>
      {allow3d && <Control position="topleft" order={60}>
        <ControlButtonStyler
          onClick={toggleMapMode}
          className="font-semibold"
        >
          {getMapModeButtonLabel(mapMode)}
        </ControlButtonStyler>
      </Control>}
      <Control position="topcenter" order={10}>
        {showLayerButtons && <LayerWrapper />}
      </Control>
      <Control position="bottomleft" order={10}>
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
      </Control>
      <Main ref={wrapperRef}>
        <>
          <div
            className={"map-container-2d"}
            style={{
              visibility: mapMode === MapMode._2D ? "visible" : "hidden",
              opacity: mapMode === MapMode._2D ? 1 : 0,
              pointerEvents: mapMode === MapMode._2D ? "auto" : "none",
            }}
          >
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
              // gazetteerSearchPlaceholder="Stadtteil | Adresse | POI"
              gazetteerSearchComponent={<></>}
              infoBox={
                mode === "measurement" ? (
                  <InfoBoxMeasurement key={mode} />
                ) : (
                  <div></div>
                )
              }
            >
              {backgroundLayer.visible &&
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
              {layers.map((layer, i) => {
                if (layer.visible) {
                  switch (layer.layerType) {
                    case "wmts":
                      return (
                        <CismapLayer
                          key={`${focusMode}_${i}_${layer.id}`}
                          url={layer.props.url}
                          maxZoom={26}
                          layers={layer.props.name}
                          format="image/png"
                          tiled={true}
                          transparent="true"
                          pane="additionalLayers1"
                          opacity={layer.opacity.toFixed(1) || 0.7}
                          type={"wmts"}
                        />
                      );
                    case "vector":
                      return (
                        <CismapLayer
                          key={`${focusMode}_${i}_${layer.id}_${layer.opacity}`}
                          style={layer.props.style}
                          maxZoom={26}
                          pane={`additionalLayers${i}`}
                          opacity={layer.opacity || 0.7}
                          type="vector"
                        />
                      );
                  }
                } else {
                  return <></>;
                }
              })}
            </TopicMapComponent>
          </div>

          {allow3d && <TweakpaneProvider>
            <CustomViewerContextProvider
              viewerState={defaultViewerState}
              providerConfig={{
                terrainProvider: WUPP_TERRAIN_PROVIDER,
                imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
                models: MODEL_ASSETS,
              }}
            >
              <div
                ref={container3dMapRef}
                className={"map-container-3d"} style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  visibility: mapMode === MapMode._3D ? "visible" : "hidden",
                  pointerEvents: mapMode === MapMode._3D ? "auto" : "none",
                }}>
                <CustomViewer
                  showControls={false}
                  showCrosshair={false}
                  showFader={false}
                  containerRef={container3dMapRef}
                  enableLocationHashUpdate={false}
                  enableTopicMap={false}
                >
                </CustomViewer>
              </div>

            </CustomViewerContextProvider>
          </TweakpaneProvider>}
        </>
      </Main>
    </ControlLayout >
  );
};

export default GeoportalMap;

const LocateControlComponent = ({ startLocate = 0 }) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(
    TopicMapContext,
  ) as any;
  const [locationInstance, setLocationInstance] =
    useState<LocateControl | null>(null);

  useEffect(() => {
    if (!locationInstance && routedMapRef) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const lc = (L.control as LocateControl)
        .locate({
          position: "topright",
          flyTo: true,
          drawMarker: false,
          icon: "custom_icon",
        })
        .addTo(mapExample);
      setLocationInstance(lc);
    }

    // return () => {
    //   lc.remove();
    // };
  }, [routedMapRef]);

  useEffect(() => {
    if (startLocate && locationInstance) {
      locationInstance.start();
    }
  }, [startLocate]);

  return null;
};
