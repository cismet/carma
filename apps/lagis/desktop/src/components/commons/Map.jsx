import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";
import { Card, Tooltip, Tag } from "antd";

import PropTypes from "prop-types";
import { useContext, useEffect, useRef, useState } from "react";
import { GEMARKUNGEN } from "../ui/generalConstant";
import {
  FeatureCollectionDisplay,
  MappingConstants,
  RoutedMap,
  TransitiveReactLeaflet,
} from "react-cismap";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  getBoundsForFeatureArray,
  getCenterAndZoomForBounds,
} from "../../core/tools/mappingTools";
import {
  getHasFittedBounds,
  getShowBackground,
  getShowCurrentFeatureCollection,
  getShowInspectMode,
  setFeatureCollection,
  setFlaechenSelected,
  setFrontenSelected,
  setGeneralGeometrySelected,
  setGraphqlLayerStatus,
  setHasFittedBounds,
  setShowBackground,
  setShowCurrentFeatureCollection,
  setShowInspectMode,
} from "../../store/slices/mapping";
import { useDispatch, useSelector } from "react-redux";
import { FileImageOutlined, FileImageFilled } from "@ant-design/icons";
import BackgroundLayers from "./BackgroundLayers";
import AdditionalLayers from "./AdditionalLayers";
import {
  getActiveAdditionalLayers,
  getActiveBackgroundLayer,
  getAdditionalLayerOpacities,
  getBackgroundLayerOpacities,
  isMapLoading,
  setHoveredLandparcel,
  getSelectedTrueOrthoYear,
} from "../../store/slices/ui";
import proj4 from "proj4";
import { proj4crs3857def } from "react-cismap/constants/gis";
import { getJWT } from "../../store/slices/auth";
import HoveredLandparcelInfo from "./HoveredLandparcelInfo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBinoculars } from "@fortawesome/free-solid-svg-icons";
import { PointSearchButton, PointSearch } from "@carma-appframeworks/alkis";
import { getShapeMode, storeShapeMode } from "../../store/slices/searchMode";
import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
} from "@carma-appframeworks/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { ZoomControl } from "@carma-mapping/components";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";
import {
  MeasurementControl,
  InfoBoxMeasurement,
  useMapMeasurementsContext,
  MEASUREMENT_MODE,
  Measurements,
} from "@carma-commons/measurements";

const { ScaleControl } = TransitiveReactLeaflet;

const mockExtractor = (input) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: [],
  };
};

function landparcelToString(props) {
  const { gemarkung, flur, fstck_zaehler, fstck_nenner } = props;
  if (!gemarkung || !flur || !fstck_zaehler) {
    return;
  }
  // Remove leading zeros from flur and fstck_zaehler
  const formattedFlur = parseInt(flur, 10);
  const formattedZaehler = parseInt(fstck_zaehler, 10);

  // Format fstck_nenner, if it exists and is not null
  const formattedNenner = fstck_nenner ? `/${parseInt(fstck_nenner, 10)}` : "";

  return `${gemarkung} ${formattedFlur} ${formattedZaehler}${formattedNenner}`;
}

const Map = ({
  dataIn,
  extractor = mockExtractor,
  width = 400,
  height = 500,
  children,
  boundingBoxChangedHandler = () => {},
  onClickHandler = () => {},
  page,
}) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();
  const showCurrentFeatureCollection = useSelector(
    getShowCurrentFeatureCollection
  );
  const showBackground = useSelector(getShowBackground);
  const showInspectMode = useSelector(getShowInspectMode);
  const jwt = useSelector(getJWT);
  const mode = useSelector(getShapeMode);

  const [overlayFeature, setOverlayFeature] = useState(null);
  const [alkisMap, setAlkisMap] = useState(null);

  const data = extractor(dataIn);
  const padding = 5;
  const headHeight = 37;
  const cardRef = useRef(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [mapHeight, setMapHeight] = useState(window.innerHeight * 0.5); //uggly winning

  const {
    backgroundModes,
    selectedBackground,
    baseLayerConf,
    backgroundConfigurations,
    activeAdditionalLayerKeys,
  } = useContext(TopicMapStylingContext);

  const { setRoutedMapRef } = useContext(TopicMapDispatchContext);

  const isMapLoadingValue = useSelector(isMapLoading);
  let backgroundsFromMode;
  const browserlocation = useLocation();
  function paramsToObject(entries) {
    const result = {};
    for (const [key, value] of entries) {
      // each 'entry' is a [key, value] tupple
      result[key] = value;
    }
    return result;
  }

  const hasFittedBounds = useSelector(getHasFittedBounds);

  const urlSearchParams = new URLSearchParams(browserlocation.search);
  const urlSearchParamsObject = paramsToObject(urlParams);

  const mapFallbacks = {
    position: {
      lat: urlSearchParamsObject?.lat ?? 51.272570027476256,
      lng: urlSearchParamsObject?.lng ?? 7.19963690266013,
    },
    zoom: urlSearchParamsObject?.zoom ?? 16,
  };
  try {
    backgroundsFromMode = backgroundConfigurations[selectedBackground].layerkey;
  } catch (e) {}

  const lastPointSearchTimeRef = useRef(0);

  const handleSetShowBackground = () => {
    dispatch(setShowBackground(!showBackground));
  };
  const handleShowCurrentFeatureCollection = () => {
    dispatch(setShowCurrentFeatureCollection(!showCurrentFeatureCollection));
  };
  const handleSetShowInspectMode = () => {
    dispatch(setShowInspectMode(!showInspectMode));
  };

  const handleSetDonutWithDelay = (mode = "point") => {
    lastPointSearchTimeRef.current = Date.now();
    dispatch(storeShapeMode(mode));
    if (mode === "point") {
      setMeasurementMode("default");
    }
  };

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMapWidth(cardRef?.current?.offsetWidth);
        setMapHeight(cardRef?.current?.offsetHeight);
      }
    });

    resizeObserver.observe(cardRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    // const params = paramsToObject(urlParams);
    // if (params.lat && params.lng && params.zoom) {
    //   console.log("xxx won't change map view");
    // } else {
    //   console.log("xxx data changed", data?.featureCollection);
    //   if (data?.featureCollection && refRoutedMap?.current) {
    //     fitFeatureArray(data?.featureCollection, refRoutedMap);
    //   }
    // }
  }, [data?.featureCollection, urlParams]);

  let refRoutedMap = useRef(null);
  const statusBarHeight = 20;
  const mapStyle = {
    width: mapWidth - 2 * padding,
    height: mapHeight - 2 * padding - headHeight,
    cursor: isMapLoadingValue ? "wait" : "pointer",
    clear: "both",
  };

  const defaults = {
    maxWidth: 200,
    metric: true,
    imperial: false,
    updateWhenIdle: false,
    position: "topright",
  };

  // Register hover listener on Leaflet map to query MapLibre features
  useEffect(() => {
    if (!alkisMap || !refRoutedMap.current) {
      return;
    }

    const leafletMap = refRoutedMap.current.leafletMap.leafletElement;

    let throttleTimeout = null;
    let lastLandparcelString = null;

    const handleMouseMove = (e) => {
      // Throttle: skip if already processing
      if (throttleTimeout) return;

      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
      }, 100); // 100ms throttle

      // Get point relative to MapLibre canvas
      const canvas = alkisMap.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const point = [
        e.originalEvent.clientX - rect.left,
        e.originalEvent.clientY - rect.top,
      ];

      const features = alkisMap.queryRenderedFeatures(point);

      if (features && features.length > 0) {
        const feature = features[0];
        const props = feature.properties;

        // Format: "Gemarkung Flur Zähler/Nenner"
        const gemarkungName =
          GEMARKUNGEN[props.gemarkungsnummer] || props.gemarkungsnummer;
        const flur = parseInt(props.flurnummer, 10);
        const zaehler = parseInt(props.zaehler, 10);
        const nenner = props.nenner ? `/${parseInt(props.nenner, 10)}` : "";

        const landparcelString = `${gemarkungName} ${flur} ${zaehler}${nenner}`;

        // Only dispatch if value changed
        if (landparcelString !== lastLandparcelString) {
          dispatch(setHoveredLandparcel(landparcelString));
          lastLandparcelString = landparcelString;
        }
      } else {
        // Clear when no feature under cursor
        if (lastLandparcelString !== undefined) {
          dispatch(setHoveredLandparcel(undefined));
          lastLandparcelString = undefined;
        }
      }
    };

    leafletMap.on("mousemove", handleMouseMove);

    return () => {
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
      leafletMap.off("mousemove", handleMouseMove);
    };
  }, [alkisMap]);

  useEffect(() => {
    if (refRoutedMap?.current) {
      const map = refRoutedMap.current.leafletMap.leafletElement;
      map.invalidateSize();
    }
  }, [mapWidth, mapHeight]);

  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  const selectedTrueOrthoYear = useSelector(getSelectedTrueOrthoYear);

  const oldBgRef = useRef(null);
  const oldAdditionalLayersLengthRef = useRef(null);

  useEffect(() => {
    const now = Date.now();

    if (now - lastPointSearchTimeRef.current < 1000) {
      return;
    }

    if (data?.featureCollection) {
      dispatch(setFeatureCollection(data?.featureCollection));
    }

    if (
      isMapLoadingValue === false &&
      data?.featureCollection &&
      data?.featureCollection.length !== 0 &&
      refRoutedMap?.current &&
      activeBackgroundLayer === oldBgRef.current &&
      oldAdditionalLayersLengthRef.current === activeAdditionalLayers.length &&
      !hasFittedBounds
    ) {
      const map = refRoutedMap.current.leafletMap.leafletElement;
      const bb = getBoundsForFeatureArray(data?.featureCollection);
      if (map && bb) {
        map.fitBounds(bb);
        dispatch(setHasFittedBounds(true));
      }
    }

    if (activeBackgroundLayer !== oldBgRef.current) {
      oldBgRef.current = activeBackgroundLayer;
    }

    if (
      oldAdditionalLayersLengthRef.current !== activeAdditionalLayers.length
    ) {
      oldAdditionalLayersLengthRef.current = activeAdditionalLayers.length;
    }
  }, [
    data?.featureCollection,
    refRoutedMap.current,
    isMapLoadingValue,
    activeBackgroundLayer,
    activeAdditionalLayers,
    mode,
    hasFittedBounds,
  ]);

  const { gazData } = useGazData();
  const { setSelection } = useSelection();
  const { mode: measurementMode, setMode: setMeasurementMode } =
    useMapMeasurementsContext();

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));

    setTimeout(() => {
      const pos = proj4(proj4crs3857def, proj4.defs("EPSG:4326"), [
        selection.x,
        selection.y,
      ]);
      const map = refRoutedMap.current.leafletMap.leafletElement;
      map.panTo([pos[1], pos[0]], {
        animate: false,
      });

      let hitObject = { ...selection };

      //Change the Zoomlevel of the map
      if (hitObject.more.zl) {
        map.setZoom(hitObject.more.zl, {
          animate: false,
        });
      }
    }, 0);
  };

  useEffect(() => {
    if (refRoutedMap.current !== null) {
      setRoutedMapRef(refRoutedMap.current);
    }
  }, [refRoutedMap]);

  const isBreakpointForControls = 738 < mapWidth;
  const pixelWidth = isBreakpointForControls ? 350 : mapWidth - 30;

  return (
    <Card
      size="small"
      hoverable={false}
      title={
        <div>
          <span className="mr-6">Karte</span>
          <HoveredLandparcelInfo />
        </div>
      }
      extra={
        <div className="flex items-center gap-3">
          {page && (
            <div
              className="relative flex items-center"
              style={{ height: "24px" }}
            >
              <Tooltip title="Untersuchungsmodus">
                <FontAwesomeIcon
                  icon={faBinoculars}
                  style={{ fontSize: "19px" }}
                  onClick={handleSetShowInspectMode}
                />
              </Tooltip>
              <div
                className={`w-3 h-3 rounded-full bg-[#4ABC96] ${
                  showInspectMode ? "absolute" : "hidden"
                } bottom-0 -right-1 cursor-pointer`}
                onClick={handleSetShowInspectMode}
              />
            </div>
          )}

          {mode === "point" && (
            <Tag
              closeIcon
              onClose={() => dispatch(storeShapeMode("default"))}
              className="mr-0"
            >
              <span className="text-gray-500">Flurstücksinfo aktiv</span>
            </Tag>
          )}

          <div className="relative flex items-center gap-2 cursor-pointer">
            <PointSearchButton
              setMode={handleSetDonutWithDelay}
              active={mode === "point"}
              mode={mode}
              activeIndicatorColor="[#4ABC96]"
            />
            <Tooltip title="Hintergrund an/aus">
              <FileImageFilled
                className="text-lg h-6 cursor-pointer"
                onClick={handleSetShowBackground}
              />
            </Tooltip>
            <div
              className={`w-3 h-3 rounded-full bg-[#4ABC96] ${
                showBackground ? "absolute" : "hidden"
              } bottom-0 -right-1 cursor-pointer`}
              onClick={handleSetShowBackground}
            />
          </div>
          <div className="relative flex items-center">
            <Tooltip title="Vordergrund an/aus">
              <FileImageOutlined
                className="text-lg h-6 cursor-pointer"
                onClick={handleShowCurrentFeatureCollection}
              />
            </Tooltip>
            <div
              className={`w-3 h-3 rounded-full bg-[#4ABC96] ${
                showCurrentFeatureCollection ? "absolute" : "hidden"
              } bottom-0 -right-1 cursor-pointer`}
              onClick={handleShowCurrentFeatureCollection}
            />
          </div>
        </div>
      }
      style={{
        width: "100%",
        height: "100%",
      }}
      bodyStyle={{ padding }}
      headStyle={{ backgroundColor: "white" }}
      type="inner"
      className={`overflow-hidden shadow-md ${
        measurementMode === MEASUREMENT_MODE.MEASUREMENT ? "lagis-map-card" : ""
      }`}
      ref={cardRef}
    >
      <>
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "3px",
            right: "3px",
            bottom: "0px",
            width: "calc(100% - 6px)",
            zIndex: 600,
            pointerEvents: "none",
          }}
        >
          <ControlLayout ifStorybook={false}>
            <Control position="topleft" order={10}>
              <ZoomControl />
            </Control>
            <MeasurementControl
              showInfoBox={false}
              tooltip={
                measurementMode === MEASUREMENT_MODE.MEASUREMENT
                  ? "Messungsmodus ausschalten"
                  : "Messungsmodus einschalten"
              }
            />
            {measurementMode === MEASUREMENT_MODE.MEASUREMENT && (
              <InfoBoxMeasurement pixelWidth={pixelWidth} />
            )}
            <Control position="bottomleft" order={10}>
              <div style={{ marginTop: "4px" }}>
                <LibFuzzySearch
                  gazData={gazData}
                  onSelection={onGazetteerSelection}
                  pixelwidth={
                    isBreakpointForControls ? "350px" : pixelWidth + "px"
                  }
                  placeholder="Geben Sie einen Suchbegriff ein"
                />
              </div>
            </Control>
          </ControlLayout>
        </div>

        <RoutedMap
          // editable={true}
          leafletMapProps={{ editable: true }}
          style={mapStyle}
          key={"leafletRoutedMap"}
          zoomControlEnabled={false}
          // backgroundlayers={showBackground ? _backgroundLayers : null}
          backgroundlayers={null}
          urlSearchParams={urlSearchParams}
          layers=""
          referenceSystem={MappingConstants.crs3857}
          referenceSystemDefinition={MappingConstants.proj4crs3857def}
          ref={refRoutedMap}
          minZoom={9}
          maxZoom={25}
          zoomSnap={0.5}
          zoomDelta={0.5}
          fallbackPosition={mapFallbacks.fallbackPosition}
          fallbackZoom={urlSearchParamsObject?.zoom ?? mapFallbacks.zoom ?? 17}
          locationChangedHandler={(location) => {
            const newParams = { ...paramsToObject(urlParams), ...location };
            // setUrlParams(newParams);
          }}
          boundingBoxChangedHandler={(boundingBox) => {
            // console.log("xxx boundingBox Changed", boundingBox);
          }}
          ondblclick={(event) => {
            // Don't switch landparcel when in measurement mode
            if (measurementMode === MEASUREMENT_MODE.MEASUREMENT) {
              return;
            }
            //if data contains a ondblclick handler, call it
            if (data.ondblclick) {
              data.ondblclick(
                event,
                refRoutedMap.current.leafletMap.leafletElement,
                data.featureCollection
              );
            }
          }}
        >
          <TopicMapSelectionContent />

          <ScaleControl {...defaults} position="topright" />
          {overlayFeature && (
            <ProjSingleGeoJson
              key={JSON.stringify(overlayFeature)}
              geoJson={overlayFeature}
              masked={true}
              maskingPolygon={maskingPolygon}
              mapRef={leafletRoutedMapRef}
            />
          )}
          {data.featureCollection &&
            data.featureCollection.length > 0 &&
            showCurrentFeatureCollection && (
              <FeatureCollectionDisplay
                featureCollection={data.featureCollection}
                style={data.styler}
                markerStyle={data.markerStyle}
                showMarkerCollection={data.showMarkerCollection || false}
                featureClickHandler={
                  data.featureClickHandler ||
                  ((e) => {
                    const feature = e.target.feature;
                    if (feature.selected) {
                      const map =
                        refRoutedMap.current.leafletMap.leafletElement;
                      const bb = getBoundsForFeatureArray([feature]);
                      const { center, zoom } = getCenterAndZoomForBounds(
                        map,
                        bb
                      );
                      setUrlParams((prev) => {
                        prev.set("zoom", zoom);
                        prev.set("lat", center.lat);
                        prev.set("lng", center.lng);
                        return prev;
                      });
                    } else {
                      switch (feature.featureType) {
                        case "flaeche": {
                          dispatch(storeFlaechenId(feature.id));
                          dispatch(setFlaechenSelected({ id: feature.id }));

                          break;
                        }
                        case "front": {
                          dispatch(storeFrontenId(feature.properties.id));
                          dispatch(
                            setFrontenSelected({ id: feature.properties.id })
                          );
                          break;
                        }
                        case "general": {
                          dispatch(
                            setGeneralGeometrySelected({
                              id: feature.properties.id,
                            })
                          );
                          break;
                        }
                        default: {
                          console.log(
                            "no featureClickHandler set",
                            e.target.feature
                          );
                          onClickHandler(e.target.feature);
                        }
                      }
                    }
                  })
                }
              />
            )}
          {/* {children} */}

          {showBackground && (
            <>
              <BackgroundLayers
                activeBackgroundLayer={activeBackgroundLayer}
                opacities={backgroundLayerOpacities}
                selectedYear={selectedTrueOrthoYear}
              />
              <AdditionalLayers
                jwt={jwt}
                mapRef={refRoutedMap}
                activeLayers={activeAdditionalLayers}
                opacities={additionalLayerOpacities}
                onGraphqlLayerStatus={(status) => {
                  dispatch(setGraphqlLayerStatus(status));
                  if (status === "NOT_ALLOWED") {
                    dispatch(setHoveredLandparcel(""));
                  }
                }}
                onHoverUpdate={(feature) => {
                  dispatch(setHoveredLandparcel(landparcelToString(feature)));
                }}
                onAlkisMapReady={setAlkisMap}
              />
            </>
          )}
          <PointSearch
            map={refRoutedMap?.current?.leafletMap?.leafletElement}
            setMode={handleSetDonutWithDelay}
            jwt={jwt}
            mode={mode}
          />
          <Measurements snappingLayers={alkisMap ? [alkisMap] : []} />
        </RoutedMap>

        {/* <div className="custom-left-control">
          <LibFuzzySearch
            gazData={gazData}
            onSelection={onGazetteerSelection}
            pixelwidth="400px"
            placeholder="Geben Sie einen Suchbegriff ein"
          />
        </div> */}
      </>
    </Card>
  );
};
export default Map;

Map.propTypes = {
  /**
   * The width of the map
   */
  width: PropTypes.number,

  /**
   * The height of the map
   */
  height: PropTypes.number,

  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.object,
  /**
   * The extractor function that is used to transform the dataIn object into the data object
   */
  extractor: PropTypes.func,

  /**
   * The style of the map
   */
  mapStyle: PropTypes.object,
};
