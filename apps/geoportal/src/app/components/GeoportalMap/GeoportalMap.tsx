import { useContext, useEffect, useRef, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import { useDispatch, useSelector } from "react-redux";
import { getGazData, paramsToObject } from "../../helper/helper.ts";
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
  getAllow3d,
  getMode,
  getShowLayerButtons,
  setMode,
} from "../../store/slices/ui.ts";
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
import type { LatLng, Point } from "leaflet";
import proj4 from "proj4";
import { proj4crs25832def } from "react-cismap/constants/gis";
import { ExtraMarker } from "react-cismap/ExtraMarker";
import {
  functionToFeature,
  getFeatureForLayer,
  objectToFeature,
} from "../feature-info/featureInfoHelper.tsx";
import {
  addNothingFoundID,
  clearNothingFoundIDs,
  getFeatures,
  getNothingFoundIDs,
  getPreferredLayerId,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  getVectorInfo,
  removeNothingFoundID,
  setFeatures,
  setInfoText,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
  setVectorInfo,
} from "../../store/slices/features.ts";
import store from "../../store/index.ts";
import FeatureInfoIcon from "../feature-info/FeatureInfoIcon.tsx";
import LocateControlComponent from "./controls/LocateControlComponent.tsx";
import { getAtLeastOneLayerIsQueryable, getQueryableLayers, getUrlPrefix } from './utils';
import { useDispatchSachdatenInfoText, useTourRefCollabLabels } from "./hooks.ts";

// TODO: Make transition style configurable with config and cesium library
const MAPMODE_TRANSITION_DURATION = 1000;

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
  const container2dMapRef = useRef<HTMLDivElement>(null);
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
  const preferredLayerId = useSelector(getPreferredLayerId);
  const focusMode = useSelector(getFocusMode);
  const { viewer } = useCesiumCustomViewer();
  const homeControl = useHomeControl();
  const { handleZoomIn, handleZoomOut } = useZoomControls();
  const toggleSceneStyle = useSceneStyleToggle();

  const [urlParams, setUrlParams] = useSearchParams();
  const [layoutHeight, setLayoutHeight] = useState(null);
  const [isMeasurementTooltip, setIsMeasurementTooltip] = useState(false);
  const {
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon,
  } = useContext<typeof TopicMapContext>(TopicMapContext);
  const [locationProps, setLocationProps] = useState(0);

  useDispatchSachdatenInfoText();

  const tourRefLabels = useTourRefCollabLabels();

  const version = getApplicationVersion(versionData);
  useEffect(() => {
    getGazData(setGazData);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        setHeight(wrapperRef.current.clientHeight);
        setWidth(wrapperRef.current.clientWidth);
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

  useEffect(() => {
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
              onOpenChange={(open) => {
                if (mode === "measurement") {
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
                  dispatch(
                    setMode(mode === "measurement" ? "default" : "measurement"),
                  );
                }}
                ref={tourRefLabels.measurement}
              >
                <img
                  src={`${getUrlPrefix()}${mode === "measurement"
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
        <Tooltip title="Sachdatenabfrage" placement="right">
          <ControlButtonStyler
            disabled={!isMode2d}
            onClick={() => {
              dispatch(
                setMode(mode === "featureInfo" ? "default" : "featureInfo"),
              );
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
              className={mode === "featureInfo" ? "text-[#1677ff]" : ""}
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
                const queryableLayers = getQueryableLayers(layers);
                if (
                  mode === "featureInfo" &&
                  getAtLeastOneLayerIsQueryable(layers)

                ) {
                  if (
                    queryableLayers.find(
                      (layer) => layer.layerType === "vector",
                    )
                  ) {
                    setTimeout(() => { }, 100);
                  }

                  const vectorInfo = getVectorInfo(store.getState());
                  const nothingFoundIDs = getNothingFoundIDs(store.getState());
                  dispatch(setSecondaryInfoBoxElements([]));
                  dispatch(setFeatures([]));
                  const pos = proj4(
                    proj4.defs("EPSG:4326") as unknown as string,
                    proj4crs25832def,
                    [e.latlng.lng, e.latlng.lat],
                  );


                  const vectorLayers = queryableLayers.filter(
                    (layer) => layer.layerType === "vector",
                  );

                  if (vectorLayers.length === nothingFoundIDs.length) {
                    dispatch(setVectorInfo(undefined));
                  }

                  if (
                    queryableLayers[queryableLayers.length - 1].layerType !==
                    "vector" ||
                    !vectorInfo ||
                    vectorLayers.length === nothingFoundIDs.length
                  ) {
                    setPos([e.latlng.lat, e.latlng.lng]);
                  } else {
                    setPos(null);
                  }

                  if (queryableLayers && pos[0] && pos[1]) {
                    const result = await Promise.all(
                      queryableLayers.map(async (testLayer) => {
                        if (
                          testLayer.layerType === "vector" &&
                          (testLayer.id !== vectorInfo?.id ||
                            nothingFoundIDs.includes(testLayer.id))
                        ) {
                          return undefined;
                        } else if (
                          testLayer.layerType === "vector" &&
                          testLayer.id === vectorInfo.id
                        ) {
                          return vectorInfo;
                        }

                        const feature = await getFeatureForLayer(
                          testLayer,
                          pos,
                        );

                        if (feature) {
                          return feature;
                        }
                      }),
                    );

                    const filteredResult = result
                      .filter((feature) => feature !== undefined)
                      .reverse();

                    dispatch(clearNothingFoundIDs());

                    if (filteredResult.length === 0) {
                      dispatch(setSelectedFeature(null));
                      dispatch(setSecondaryInfoBoxElements([]));
                      dispatch(setFeatures([]));
                      dispatch(
                        setInfoText(
                          "Keine Informationen an dieser Stelle gefunden.",
                        ),
                      );
                    } else {
                      if (preferredLayerId) {
                        const preferredLayerIndex = filteredResult.findIndex(
                          (feature) => feature.id === preferredLayerId,
                        );

                        if (preferredLayerIndex !== -1) {
                          filteredResult.splice(
                            0,
                            0,
                            ...filteredResult.splice(preferredLayerIndex, 1),
                          );
                        }
                      }
                      dispatch(setSelectedFeature(filteredResult[0]));
                      dispatch(
                        setSecondaryInfoBoxElements(
                          filteredResult.slice(1, filteredResult.length),
                        ),
                      );
                      dispatch(setFeatures(filteredResult));
                    }
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
              {layers &&
                layers.map((layer, i) => {
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
                            selectionEnabled={
                              mode === "featureInfo" && layer.useInFeatureInfo
                            }
                            onSelectionChanged={(e: {
                              hits: any[];
                              hit: any;
                            }) => {
                              const queryableLayers = getQueryableLayers(layers);
                              if (e.hits && layer.queryable) {
                                const selectedVectorFeature = e.hits[0];
                                const vectorPos = proj4(
                                  proj4.defs("EPSG:4326") as unknown as string,
                                  proj4crs25832def,
                                  selectedVectorFeature.geometry.coordinates,
                                );
                                const minimalBoxSize = 1;
                                const featureInfoBaseUrl =
                                  layer.other.service.url;
                                const layerName = layer.other.name;

                                const imgUrl =
                                  featureInfoBaseUrl +
                                  `?&VERSION=1.1.1&REQUEST=GetFeatureInfo&BBOX=` +
                                  `${vectorPos[0] - minimalBoxSize},` +
                                  `${vectorPos[1] - minimalBoxSize},` +
                                  `${vectorPos[0] + minimalBoxSize},` +
                                  `${vectorPos[1] + minimalBoxSize}` +
                                  `&WIDTH=10&HEIGHT=10&SRS=EPSG:25832&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xF0F0F0&EXCEPTIONS=application/vnd.ogc.se_xml&FEATURE_COUNT=99&LAYERS=${layerName}&STYLES=default&QUERY_LAYERS=${layerName}&INFO_FORMAT=text/html&X=5&Y=5
                                        `;

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
                                  const featureProperties = result.includes(
                                    "function",
                                  )
                                    ? functionToFeature(properties, result)
                                    : objectToFeature(properties, result);

                                  const feature = {
                                    properties: {
                                      ...featureProperties.properties,
                                      genericLinks: [
                                        {
                                          url: imgUrl,
                                          tooltip: "Alte Sachdatenabfrage",
                                          icon: <FeatureInfoIcon />,
                                        },
                                      ],
                                    },
                                    id: layer.id,
                                  };

                                  dispatch(setVectorInfo(feature));
                                  dispatch(removeNothingFoundID(layer.id));

                                  if (
                                    layer.id ===
                                    queryableLayers[queryableLayers.length - 1]
                                      .id
                                  ) {
                                    setPos(null);
                                  }
                                } else {
                                  dispatch(setVectorInfo(undefined));
                                }
                              } else {
                                if (layer.queryable) {
                                  dispatch(addNothingFoundID(layer.id));
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