import { useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { LatLng, Point } from "leaflet";
import proj4 from "proj4";
import CismapLayer from "react-cismap/CismapLayer";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { proj4crs25832def } from "react-cismap/constants/gis";
import { ExtraMarker } from "react-cismap/ExtraMarker";
import GazetteerHitDisplay from "react-cismap/GazetteerHitDisplay";
import PaleOverlay from "react-cismap/PaleOverlay";
import { ProjSingleGeoJson } from "react-cismap/ProjSingleGeoJson";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

import { useOverlayHelper } from "@carma/libraries/commons/ui/lib-helper-overlay";
import {
  getCollabedHelpComponentConfig,
  geoElements,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpComponentOverlayConfig } from "@carma-collab/wuppertal/helper-overlay";
import { TweakpaneProvider } from "@carma-commons/debug";
import { getApplicationVersion } from "@carma-commons/utils";

import {
  CustomViewer,
  useCesiumCustomViewer,
  setIsMode2d,
  useViewerIsMode2d,
  useSceneStyleToggle,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlLayout,
  Main,
} from "@carma-mapping/map-controls-layout";

import versionData from "../../version.json";
import { getBackgroundLayers } from "../helper/layer.tsx";

import {
  addNothingFoundID,
  clearNothingFoundIDs,
  getInfoText,
  getNothingFoundIDs,
  getPreferredLayerId,
  getVectorInfo,
  removeNothingFoundID,
  setFeatures,
  setInfoText,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
  setVectorInfo,
} from "../store/slices/features.ts";
import {
  getBackgroundLayer,
  getFocusMode,
  getLayers,
  getShowHamburgerMenu,
} from "../store/slices/mapping.ts";
import {
  getAllow3d,
  getMode,
  getShowLayerButtons,
} from "../store/slices/ui.ts";


import store from "../store/index.ts";
import { GeoportalControlLayout } from "./controls/GeoportalControlLayout.tsx";
import FeatureInfoBox from "./feature-info/FeatureInfoBox.tsx";
import {
  functionToFeature,
  getFeatureForLayer,
  objectToFeature,
} from "./feature-info/featureInfoHelper.ts";

import InfoBoxMeasurement from "./map-measure/InfoBoxMeasurement.jsx";

import "./leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getGazData, paramsToObject } from "../helper/helper.ts";


export const GeoportalMap = () => {
  const [gazData, setGazData] = useState([]);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const infoText = useSelector(getInfoText);
  const [isSameLayerTypes, setIsSameLayerTypes] = useState(true);
  const container3dMapRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const allow3d = useSelector(getAllow3d);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isMode2d = useViewerIsMode2d();
  const mode = useSelector(getMode);
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const preferredLayerId = useSelector(getPreferredLayerId);
  const focusMode = useSelector(getFocusMode);
  const { viewer } = useCesiumCustomViewer();
  const toggleSceneStyle = useSceneStyleToggle();

  const [urlParams, setUrlParams] = useSearchParams();
  const [layoutHeight, setLayoutHeight] = useState(null);

  const {
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon,
  } = useContext<typeof TopicMapContext>(TopicMapContext);
  const queryableLayers = layers.filter(
    (layer) => layer.queryable === true && layer.useInFeatureInfo === true,
  );
  const atLeastOneLayerIsQueryable = queryableLayers.length > 0;

  if (!layers.some((layer) => layer.queryable === true) && layers.length > 0) {
    dispatch(
      setInfoText(
        "Die Sachdatenabfrage ist für die ausgewählten Layer nicht verfügbar.",
      ),
    );
  } else if (
    !layers.some((layer) => layer.useInFeatureInfo === true) &&
    layers.length > 0
  ) {
    dispatch(
      setInfoText(
        "Die Sachdatenabfrage wurde für alle ausgewählten Layer deaktiviert.",
      ),
    );
  } else if (
    queryableLayers.length > 0 &&
    (infoText ===
      "Die Sachdatenabfrage ist für die ausgewählten Layer nicht verfügbar." ||
      infoText ===
      "Die Sachdatenabfrage wurde für alle ausgewählten Layer deaktiviert.")
  ) {
    dispatch(setInfoText(""));
  }

  const version = getApplicationVersion(versionData);
  useEffect(() => {
    getGazData(setGazData);
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

  return (
    <GeoportalControlLayout
      setPos={setPos} setWidth={setWidth} setHeight={setHeight}
      gazData={gazData}
      gazetteerHit={gazetteerHit}
      setGazetteerHit={setGazetteerHit}
      setOverlayFeature={setOverlayFeature}
      setLayoutHeight={setLayoutHeight}
    >
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
              if (
                mode === "featureInfo" &&
                layers.length > 0 &&
                atLeastOneLayerIsQueryable
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
                                        iconname: "lupe",
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
    </GeoportalControlLayout>
  )
};

export default GeoportalMap;
