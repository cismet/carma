import { useCallback, useContext, useEffect, useRef, useState } from "react";
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
import {
  getAllow3d,
  getMode,
  getShowLayerButtons,
  setMode,
} from "../store/slices/ui.ts";
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
  faInfo,
  faLocationArrow,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import type LocateControl from "leaflet.locatecontrol";
import "./leaflet.css";
import 'cesium/Build/Cesium/Widgets/widgets.css';

import {
  CustomViewer,
  useViewerIsMode2d,
  MapTypeSwitcher,
  SceneStyleToggle,
  Compass,
  HomeControl,
  useCesiumCustomViewer,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import GazetteerHitDisplay from "react-cismap/GazetteerHitDisplay";
import { ProjSingleGeoJson } from "react-cismap/ProjSingleGeoJson";
import { TweakpaneProvider } from "@carma-commons/debug";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { Tooltip } from "antd";
import { useOverlayHelper } from "@carma/libraries/commons/ui/lib-helper-overlay";
import FeatureInfoBox from "./feature-info/FeatureInfoBox.tsx";
import type { LatLng, Point } from "leaflet";
import proj4 from "proj4";
import { proj4crs25832def } from "react-cismap/constants/gis";
import ExtraMarker from "react-cismap/ExtraMarker";
import {
  createUrl,
  functionToFeature,
  getFeatureForLayer,
  getLeafNodes,
  objectToFeature,
} from "./feature-info/featureInfoHelper.ts";
import { LayerProps } from "@carma-mapping/layers";
import {
  addFeature,
  getFeatures,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  setFeatures,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../store/slices/features.ts";
import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";
import { useHomeControl } from "libraries/mapping/engines/cesium/src/lib/CustomViewer/hooks.ts";

export const GeoportalMap = () => {
  const [gazData, setGazData] = useState([]);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [isSameLayerTypes, setIsSameLayerTypes] = useState(true);
  const selectedFeature = useSelector(getSelectedFeature);
  const features = useSelector(getFeatures);
  const secondaryInfoBoxElements = useSelector(getSecondaryInfoBoxElements);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const allow3d = useSelector(getAllow3d);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isMode2d = useViewerIsMode2d();
  const mode = useSelector(getMode);
  const showLayerButtons = useSelector(getShowLayerButtons);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const focusMode = useSelector(getFocusMode);
  const { viewer } = useCesiumCustomViewer();
  const homeControl = useHomeControl();
  const [urlParams, setUrlParams] = useSearchParams();
  const [layoutHeight, setLayoutHeight] = useState(null);
  const {
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon,
  } = useContext<typeof TopicMapContext>(TopicMapContext);
  const [locationProps, setLocationProps] = useState(0);
  const urlPrefix = window.location.origin + window.location.pathname;

  const zoomControlTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("ZOOM", geoElements),
  );
  const fullScreenControlTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("VOLLBILD", geoElements),
  );
  const navigatorControlTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MEINE_POSITION", geoElements),
  );
  const homeControlTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("RATHAUS", geoElements),
  );
  const measurementControlTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("MESSUNGEN", geoElements),
  );

  const gazetteerControlTourRef = useOverlayHelper(
    getCollabedHelpElementsConfig("GAZETTEER_SUCHE", geoElements),
  );

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

  useEffect(() => {
    if (document.getElementById("routedMap")) {
      if (mode === "featureInfo") {
        document.getElementById("routedMap").style.cursor = "crosshair";
      } else {
        document.getElementById("routedMap").style.cursor = "pointer";
      }
    }
  }, [mode]);

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

  // TODO Move out Controls to own component

  return (
    <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div ref={zoomControlTourRef} className="flex flex-col">
          <ControlButtonStyler
            onClick={() => {
              routedMapRef.leafletMap.leafletElement.zoomIn();
              viewer?.scene.camera.zoomIn();
            }}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={() => {
              routedMapRef.leafletMap.leafletElement.zoomOut();
              viewer?.scene.camera.zoomOut();
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
            ref={fullScreenControlTourRef}
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
            ref={navigatorControlTourRef}
            onClick={() => setLocationProps((prev) => prev + 1)}
          >
            <FontAwesomeIcon icon={faLocationArrow} className="text-2xl" />
          </ControlButtonStyler>
        )}
        <LocateControlComponent startLocate={locationProps} />
      </Control>
      <Control position="topleft" order={40}>
        <ControlButtonStyler
          ref={homeControlTourRef}
          onClick={() => {
            routedMapRef.leafletMap.leafletElement.flyTo(
              [51.272570027476256, 7.199918031692506],
              18,
            );
            homeControl();
          }
          }
        >
          <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
        </ControlButtonStyler>
      </Control>
      <Control position="topleft" order={50}>
        {showMeasurementButton && (
          <div className="flex items-center gap-4">
            <Tooltip title={(allow3d && isMode2d) ? "Strecke / Fläche messen" : "zum messen zu 2D-Modus wechseln"} placement="right">
              <ControlButtonStyler
                disabled={allow3d && !isMode2d}
                onClick={() => {
                  dispatch(
                    setMode(mode === "measurement" ? "default" : "measurement"),
                  );
                }}
                ref={measurementControlTourRef}
              >
                <img
                  src={`${urlPrefix}${mode === "measurement"
                    ? "measure-active.png"
                    : "measure.png"
                    }`}
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
        <ControlButtonStyler
          onClick={() => {
            dispatch(
              setMode(mode === "featureInfo" ? "default" : "featureInfo"),
            );
            dispatch(setSelectedFeature(null));
            dispatch(setSecondaryInfoBoxElements([]));
            dispatch(setFeatures([]));
            setPos(null);
          }}
          className="font-semibold"
        >
          <FontAwesomeIcon
            icon={faInfo}
            className={mode === "featureInfo" ? "text-[#1677ff]" : ""}
          />
        </ControlButtonStyler>
      </Control>
      <Control position="topcenter" order={10}>
        {showLayerButtons && <LayerWrapper />}
      </Control>
      <Control position="bottomleft" order={10}>
        <div ref={gazetteerControlTourRef} className="h-full w-full">
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
          <div
            className={"map-container-2d"}
            style={{
              zIndex: 100,
              //visibility: isMode2d ? "visible" : "hidden",
              //opacity: isMode2d ? 1 : 0,
              //pointerEvents: isMode2d ? "auto" : "none",
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
              onclick={async (e: {
                containerPoint: Point;
                latlng: LatLng;
                layerPoint: Point;
                originalEvent: PointerEvent;
                sourceTarget: HTMLElement;
                target: HTMLElement;
                type: string;
              }) => {
                if (mode === "featureInfo") {
                  dispatch(setSecondaryInfoBoxElements([]));
                  dispatch(setFeatures([]));
                  const tmpSecondaryInfoBoxElements = [];
                  let tempSelectedFeature = null;
                  const pos = proj4(
                    proj4.defs("EPSG:4326") as unknown as string,
                    proj4crs25832def,
                    [e.latlng.lng, e.latlng.lat],
                  );

                  if (layers[layers.length - 1].layerType === "wmts") {
                    setPos([e.latlng.lat, e.latlng.lng]);
                  }

                  if (layers && pos[0] && pos[1]) {
                    const overlappingHeaders = [];

                    layers.forEach(async (testLayer, i) => {
                      if (
                        !isSameLayerTypes &&
                        i === layers.length - 1 &&
                        testLayer.layerType === "wmts"
                      ) {
                        const feature = await getFeatureForLayer(
                          testLayer,
                          pos,
                        );

                        if (feature) {
                          dispatch(addFeature(feature));

                          if (!tempSelectedFeature) {
                            dispatch(setSelectedFeature(feature));
                            tempSelectedFeature = feature;
                            return;
                          }
                          if (tempSelectedFeature) {
                            dispatch(
                              setSecondaryInfoBoxElements([
                                ...tmpSecondaryInfoBoxElements,
                                feature,
                              ]),
                            );
                            tmpSecondaryInfoBoxElements.push(feature);
                          }
                        } else {
                          dispatch(setSelectedFeature(null));
                          dispatch(setSecondaryInfoBoxElements([]));
                          dispatch(setFeatures([]));
                        }
                      } else if (isSameLayerTypes && layers.length > 1) {
                        const feature = await getFeatureForLayer(
                          testLayer,
                          pos,
                        );
                        if (feature) {
                          dispatch(addFeature(feature));

                          if (!tempSelectedFeature) {
                            dispatch(setSelectedFeature(feature));
                            tempSelectedFeature = feature;
                            return;
                          }
                          if (tempSelectedFeature) {
                            dispatch(
                              setSecondaryInfoBoxElements([
                                ...tmpSecondaryInfoBoxElements,
                                feature,
                              ]),
                            );
                            tmpSecondaryInfoBoxElements.push(feature);
                          }
                        }
                      } else if (layers.length === 1) {
                        const feature = await getFeatureForLayer(
                          testLayer,
                          pos,
                        );
                        if (feature) {
                          dispatch(addFeature(feature));

                          if (!tempSelectedFeature) {
                            dispatch(setSelectedFeature(feature));
                            tempSelectedFeature = feature;
                            return;
                          }
                          if (tempSelectedFeature) {
                            dispatch(
                              setSecondaryInfoBoxElements([
                                ...tmpSecondaryInfoBoxElements,
                                feature,
                              ]),
                            );
                            tmpSecondaryInfoBoxElements.push(feature);
                          }
                        } else {
                          dispatch(setSelectedFeature(null));
                          dispatch(setSecondaryInfoBoxElements([]));
                          dispatch(setFeatures([]));
                        }
                      }
                    });
                  }
                }
              }}
              gazetteerSearchComponent={<></>}
              infoBox={
                mode === "measurement" ? (
                  <InfoBoxMeasurement key={mode} />
                ) : mode === "featureInfo" ? (
                  <FeatureInfoBox />
                ) : (
                  <div></div>
                )
              }
            >
              {backgroundLayer && backgroundLayer.visible &&
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
              {layers && layers.map((layer, i) => {
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
                          maxSelectionCount={0}
                          onSelectionChanged={(e: {
                            hits: any[];
                            hit: any;
                          }) => {
                            if (e.hits && i === layers.length - 1) {
                              const selectedVectorFeature = e.hits[0];

                              const properties =
                                selectedVectorFeature.properties;
                              let result = "";
                              layer.other.keywords.forEach((keyword) => {
                                const extracted = keyword.split(
                                  "carmaconf://infoBoxMapping:",
                                )[1];
                                if (extracted) {
                                  result += extracted + "\n";
                                }
                              });

                              if (result) {
                                const feature = result.includes("function")
                                  ? functionToFeature(properties, result)
                                  : objectToFeature(properties, result);

                                if (selectedFeature) {
                                  dispatch(
                                    setSecondaryInfoBoxElements([feature]),
                                  );
                                } else {
                                  dispatch(setSelectedFeature(feature));
                                }
                              }
                            }
                          }}
                        />
                      );
                  }
                }
              })}
              {pos && mode === "featureInfo" && layers.length > 0 && (
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
                  visibility: !isMode2d ? "visible" : "hidden",
                  pointerEvents: !isMode2d ? "auto" : "none",
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
