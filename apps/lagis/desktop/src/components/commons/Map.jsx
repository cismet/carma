import "react-cismap/topicMaps.css";
import "leaflet/dist/leaflet.css";
import { Card, Tooltip } from "antd";
import PropTypes from "prop-types";
import { useContext, useEffect, useRef, useState } from "react";
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
  getShowBackground,
  getShowCurrentFeatureCollection,
  getShowInspectMode,
  setFlaechenSelected,
  setFrontenSelected,
  setGeneralGeometrySelected,
  setGraphqlLayerStatus,
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
} from "../../store/slices/ui";
import proj4 from "proj4";
import { proj4crs3857def } from "react-cismap/constants/gis";
import { getJWT } from "../../store/slices/auth";
import HoveredLandparcelInfo from "./HoveredLandparcelInfo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBinoculars } from "@fortawesome/free-solid-svg-icons";
import { PointSearchButton, PointSearch } from "@carma-apps/alkis-renderer";
import { getShapeMode, storeShapeMode } from "../../store/slices/searchMode";
import {
  TopicMapSelectionContent,
  useGazData,
  useSelection,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
import { Control, ControlLayout } from "@carma-mapping/map-controls-layout";
import { ZoomControl } from "@carma-mapping/components";
import { TopicMapDispatchContext } from "react-cismap/contexts/TopicMapContextProvider";

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

  // const {
  //   setSelectedBackground,
  //   setNamedMapStyle,
  //   setActiveAdditionalLayerKeys,
  // } = useContext(TopicMapStylingDispatchContext);

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

  // const _backgroundLayers = backgroundsFromMode || "rvrGrau@40";
  // const opacities = useSelector(getAdditionalLayerOpacities);
  const handleSetShowBackground = () => {
    dispatch(setShowBackground(!showBackground));
  };
  const handleShowCurrentFeatureCollection = () => {
    dispatch(setShowCurrentFeatureCollection(!showCurrentFeatureCollection));
  };
  const handleSetShowInspectMode = () => {
    dispatch(setShowInspectMode(!showInspectMode));
  };

  // const handleSetDonutSearch = (mode = "point") => {
  //   dispatch(storeShapeMode(mode));
  // };

  const handleSetDonutWithDelay = (mode = "point") => {
    lastPointSearchTimeRef.current = Date.now();
    dispatch(storeShapeMode(mode));
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

  const oldBgRef = useRef(null);
  const oldAdditionalLayersLengthRef = useRef(null);

  useEffect(() => {
    const now = Date.now();

    if (now - lastPointSearchTimeRef.current < 1000) {
      return;
    }

    if (
      isMapLoadingValue === false &&
      data?.featureCollection &&
      data?.featureCollection.length !== 0 &&
      refRoutedMap?.current &&
      activeBackgroundLayer === oldBgRef.current &&
      oldAdditionalLayersLengthRef.current === activeAdditionalLayers.length
    ) {
      const map = refRoutedMap.current.leafletMap.leafletElement;
      const bb = getBoundsForFeatureArray(data?.featureCollection);
      if (map && bb) {
        map.fitBounds(bb);
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
  ]);

  const { gazData } = useGazData();
  const { setSelection } = useSelection();
  // useSelectionTopicMap();

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
  return (
    <Card
      size="small"
      hoverable={false}
      title={
        <span>
          <span className="mr-6">Karte</span>
          <HoveredLandparcelInfo />
        </span>
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

          <div className="relative flex items-center gap-2 cursor-pointer">
            <PointSearchButton setMode={handleSetDonutWithDelay} />
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
      className="overflow-hidden shadow-md"
      ref={cardRef}
    >
      <>
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "3px",
            bottom: "0px",
            zIndex: 600,
          }}
        >
          <ControlLayout ifStorybook={false}>
            <Control position="topleft" order={10}>
              <ZoomControl />
            </Control>
          </ControlLayout>
        </div>
        <RoutedMap
          editable={false}
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
            //if data contains a ondblclick handler, call it
            if (data.ondblclick) {
              data.ondblclick(event);
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
              />
            </>
          )}
          <PointSearch
            map={refRoutedMap?.current?.leafletMap?.leafletElement}
            setMode={handleSetDonutWithDelay}
            jwt={jwt}
            mode={mode}
          />
        </RoutedMap>
        <div className="custom-left-control">
          <LibFuzzySearch
            gazData={gazData}
            onSelection={onGazetteerSelection}
            pixelwidth="400px"
            placeholder="Geben Sie einen Suchbegriff ein"
          />
        </div>
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
