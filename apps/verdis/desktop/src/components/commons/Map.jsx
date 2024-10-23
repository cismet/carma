import 'react-cismap/topicMaps.css';
import 'leaflet/dist/leaflet.css';
import { Card, Tooltip } from 'antd';
import PropTypes from 'prop-types';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  FeatureCollectionDisplay,
  MappingConstants,
  RoutedMap,
  TransitiveReactLeaflet,
} from 'react-cismap';
import {
  TopicMapStylingContext,
  TopicMapStylingDispatchContext,
} from 'react-cismap/contexts/TopicMapStylingContextProvider';
import GazetteerSearchControl from 'react-cismap/GazetteerSearchControl';
import GazetteerHitDisplay from 'react-cismap/GazetteerHitDisplay';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  getBoundsForFeatureArray,
  getCenterAndZoomForBounds,
  createQueryGeomFromBB,
} from '../../tools/mappingTools';
import Dot from './Dot';
import { faImage as regularImage } from '@fortawesome/free-regular-svg-icons';
import Overlay from './Overlay';
import LandParcelChooser from './LandParcelChooser';

import {
  getIsLoading,
  getIsLoadingGeofields,
  getIsLoadingKassenzeichenWithPoint,
  searchForGeoFields,
  searchForKassenzeichenWithPoint,
  storeFlaechenId,
  storeFrontenId,
} from '../../store/slices/search';
import {
  getLockMap,
  getShowBackground,
  getShowCurrentFeatureCollection,
  setFlaechenSelected,
  setFrontenSelected,
  setGeneralGeometrySelected,
  getLockMapOnlyInKassenzeichen,
  setLockMapOnlyInKassenzeichen,
  setShowBackground,
  setShowCurrentFeatureCollection,
  setGraphqlStatus,
  setLockMap,
  getFitBoundsCounter,
} from '../../store/slices/mapping';
import { getArea25832 } from '../../tools/kassenzeichenMappingTools';
import {
  faExpandArrowsAlt,
  faF,
  faLock,
  faLockOpen,
  faPlane,
  faImage as solidImage,
} from '@fortawesome/free-solid-svg-icons';
import { useDispatch, useSelector } from 'react-redux';
import { FileImageOutlined, FileImageFilled } from '@ant-design/icons';

import { getGazData } from '../../store/slices/gazData';
import BackgroundLayers from './BackgroundLayers';
import AdditionalLayers from './AdditionalLayers';
import {
  getActiveAdditionalLayers,
  getActiveBackgroundLayer,
  getAdditionalLayerOpacities,
  getBackgroundLayerOpacities,
  getHoveredObject,
  isMapLoading,
  setHoveredObject,
} from '../../store/slices/ui';
import proj4 from 'proj4';
import { proj4crs3857def } from 'react-cismap/constants/gis';
import { getJWT } from '../../store/slices/auth';
import Toolbar from './Toolbar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const { ScaleControl } = TransitiveReactLeaflet;

const mockExtractor = (input) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: [],
  };
};

const Map = ({
  shownIn,
  dataIn,
  extractor = mockExtractor,
  width = 400,
  height = 500,
  children,
  boundingBoxChangedHandler = () => {},
}) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [urlParams, setUrlParams] = useSearchParams();
  // const [fallback, setFallback] = useState({});
  const [showVirtualCityOverlay, setShowVirtualCityOverlay] = useState(false);
  const [infoText, setInfoText] = useState('');
  const showCurrentFeatureCollection = useSelector(
    getShowCurrentFeatureCollection
  );
  const fitBoundsCounter = useSelector(getFitBoundsCounter);

  const isLoading = useSelector(getIsLoading);
  const gazData = useSelector(getGazData);
  const showBackground = useSelector(getShowBackground);
  const jwt = useSelector(getJWT);
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [gazetteerHit, setGazetteerHit] = useState(null);

  //state for hover landparcel string

  const gazetteerHitTrigger = (hits) => {
    //somehow the map gets not moved to the right position on the first try, so this is an ugly winning to get it right
    const pos = proj4(proj4crs3857def, proj4.defs('EPSG:4326'), [
      hits[0].x,
      hits[0].y,
    ]);
    const map = refRoutedMap.current.leafletMap.leafletElement;
    map.panTo([pos[1], pos[0]], {
      animate: false,
    });

    let hitObject = { ...hits[0] };

    //Change the Zoomlevel of the map
    if (hitObject.more.zl) {
      map.setZoom(hitObject.more.zl, {
        animate: false,
      });
    }
  };
  const searchControlWidth = 500;
  const gazetteerSearchPlaceholder = undefined;

  const data = extractor(dataIn);
  const padding = 5;
  const headHeight = 37;
  const toolBarHeight = 34;

  const cardRef = useRef(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [showLandParcelChooser, setShowLandParcelChooser] = useState(false);
  const [initialFitBoundsCounter, setInitialFitBoundsCounter] =
    useState(fitBoundsCounter);
  const [mapHeight, setMapHeight] = useState(window.innerHeight * 0.5); //uggly winning
  const {
    backgroundModes,
    selectedBackground,
    baseLayerConf,
    backgroundConfigurations,
    activeAdditionalLayerKeys,
  } = useContext(TopicMapStylingContext);

  const {
    setSelectedBackground,
    setNamedMapStyle,
    setActiveAdditionalLayerKeys,
  } = useContext(TopicMapStylingDispatchContext);
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

  const _backgroundLayers = backgroundsFromMode || 'rvrGrau@40';
  const opacities = useSelector(getAdditionalLayerOpacities);
  const handleSetShowBackground = () => {
    dispatch(setShowBackground(!showBackground));
  };
  const handleShowCurrentFeatureCollection = () => {
    dispatch(setShowCurrentFeatureCollection(!showCurrentFeatureCollection));
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
  const statusBarHeight = 34;
  const mapStyle = {
    width: mapWidth - 2 * padding,
    height: mapHeight - 2 * padding - headHeight - statusBarHeight,
    cursor: isMapLoadingValue ? 'wait' : 'pointer',
    clear: 'both',
  };

  const defaults = {
    maxWidth: 200,
    metric: true,
    imperial: false,
    updateWhenIdle: false,
    position: 'topright',
  };

  useEffect(() => {
    if (refRoutedMap?.current) {
      const map = refRoutedMap.current.leafletMap.leafletElement;
      map.invalidateSize();
    }
  }, [mapWidth, mapHeight]);
  [,];

  const lockMap = useSelector(getLockMap);
  const lockMapOnlyInKassenzeichen = useSelector(getLockMapOnlyInKassenzeichen);

  function fitMapBounds() {
    const map = refRoutedMap?.current?.leafletMap?.leafletElement;
    if (map == undefined) {
      console.log('xxx map is undefined');
      return;
    } else {
    }
    let bb = undefined;
    if (data?.featureCollection && data?.featureCollection.length > 0) {
      // console.log("xxx will use featureCollection", data?.featureCollection);

      bb = getBoundsForFeatureArray(data?.featureCollection);
    } else if (data?.allFeatures && data?.allFeatures.length > 0) {
      // console.log("xxx will use allFeatures", data?.allFeatures);
      bb = getBoundsForFeatureArray(data?.allFeatures);
    }

    if (map && bb) {
      map.fitBounds(bb);
      // console.log("xxx fitBounds");
    }
  }

  useEffect(() => {
    if (fitBoundsCounter > initialFitBoundsCounter) {
      setTimeout(() => {
        fitMapBounds();
      }, 250);
    }
    // if (isLoading === true) {
    //   return;
    // }
    // if (lockMap) {
    //   return;
    // }
  }, [fitBoundsCounter]);

  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  // console.log("xxx data", data);

  return (
    <Card
      size="small"
      hoverable={false}
      title={<span>Karte</span>}
      extra={
        <div className="flex items-center gap-4">
          {/* {(isLoadingGeofields || isLoadingKassenzeichenWithPoint) && (
            <LoadingOutlined />
          )} */}
          <Tooltip title="optimaler Kartenausschnitt für dieses Kassenzeichen">
            <div
              className="relative flex cursor-pointer items-center justify-center"
              onClick={() => fitMapBounds()}
            >
              <FontAwesomeIcon icon={faExpandArrowsAlt} className={`h-6`} />
            </div>
          </Tooltip>
          <Tooltip title="Kartenausschnitt für dieses Kassenzeichen beibehalten">
            <div
              className="relative flex cursor-pointer items-center justify-center"
              onClick={() =>
                dispatch(
                  setLockMapOnlyInKassenzeichen(!lockMapOnlyInKassenzeichen)
                )
              }
            >
              <FontAwesomeIcon
                icon={lockMapOnlyInKassenzeichen ? faLock : faLockOpen}
                className={`h-6 ${lockMapOnlyInKassenzeichen && 'pr-[5.5px]'}`}
              />
              <span className="absolute -bottom-[10px] right-0 text-primary font-bold text-lg">
                K
              </span>
            </div>
          </Tooltip>
          <Tooltip title="Kartenausschnitt beibehalten">
            <FontAwesomeIcon
              icon={lockMap ? faLock : faLockOpen}
              onClick={() => dispatch(setLockMap(!lockMap))}
              className={`h-6 cursor-pointer ${lockMap && 'pr-[5.5px]'}`}
            />
          </Tooltip>
          <Tooltip title="Schrägluftbild Overlay an/aus">
            <div
              className="relative flex items-center"
              onClick={() => setShowVirtualCityOverlay(!showVirtualCityOverlay)}
              role="button"
            >
              <FontAwesomeIcon icon={faPlane} className="h-6 cursor-pointer" />
              <Dot showDot={showVirtualCityOverlay} />
            </div>
          </Tooltip>
          <Tooltip title="Hintergrund an/aus">
            <div
              className="relative flex items-center"
              onClick={() => dispatch(setShowBackground(!showBackground))}
              role="button"
            >
              <FontAwesomeIcon
                icon={solidImage}
                className="h-6 cursor-pointer"
              />
              <Dot showDot={showBackground} />
            </div>
          </Tooltip>
          <Tooltip title="Vordergrund an/aus">
            <div
              className="relative flex items-center"
              onClick={() =>
                dispatch(
                  setShowCurrentFeatureCollection(!showCurrentFeatureCollection)
                )
              }
              role="button"
            >
              <FontAwesomeIcon
                icon={regularImage}
                className="h-6 cursor-pointer"
              />
              <Dot showDot={showCurrentFeatureCollection} />
            </div>
          </Tooltip>
        </div>
      }
      style={{
        width: '100%',
        height: '100%',
      }}
      bodyStyle={{ padding }}
      headStyle={{ backgroundColor: 'white' }}
      type="inner"
      className="overflow-hidden shadow-md"
      ref={cardRef}
    >
      <RoutedMap
        editable={false}
        style={mapStyle}
        key={'leafletRoutedMap'}
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
        fallbackPosition={mapFallbacks.position}
        fallbackZoom={urlSearchParamsObject?.zoom ?? mapFallbacks.zoom ?? 17}
        locationChangedHandler={(location) => {
          const newParams = { ...paramsToObject(urlParams), ...location };
          setUrlParams(newParams);
        }}
        boundingBoxChangedHandler={(boundingBox) => {
          boundingBoxChangedHandler(boundingBox);
          // try {
          //   const bbPoly = createQueryGeomFromBB(boundingBox);
          //   const area = getArea25832(bbPoly);
          //   const maxAreaForSearch = 130000;
          //   if (area < maxAreaForSearch && area !== 0) {
          //     setInfoText("");
          //     dispatch(searchForGeoFields(bbPoly));
          //   } else {
          //     setInfoText(
          //       "Zur Anzeige aller Flächen und Fronten, bitte eine größere Zoomstufe wählen"
          //     );
          //     dispatch(setToolbarProperties({}));
          //     dispatch(setFeatureCollection(undefined));
          //   }
          // } catch (e) {
          //   console.log("error in boundingBoxChangedHandler", e);
          // }
        }}
        ondblclick={(event) => {
          //if data contains a ondblclick handler, call it
          //Temporarily dsiable double click search
          // if (data.ondblclick) {
          //   data.ondblclick(event);
          // }
        }}
        // ondblclick={(event) => {
        //   //if data contains a ondblclick handler, call it
        //   if (data.ondblclick) {
        //     data.ondblclick(event);
        //   } else {
        //     const xy = convertLatLngToXY(event.latlng);
        //     dispatch(
        //       searchForKassenzeichenWithPoint(
        //         xy[0],
        //         xy[1],
        //         urlParams,
        //         setUrlParams
        //       )
        //     );
        //   }
        // }}
      >
        <ScaleControl {...defaults} position="topright" />
        {/* {overlayFeature && (
          <ProjSingleGeoJson
            key={JSON.stringify(overlayFeature)}
            geoJson={overlayFeature}
            masked={true}
            maskingPolygon={maskingPolygon}
            mapRef={leafletRoutedMapRef}
          />
        )} */}
        <GazetteerHitDisplay
          key={'gazHit' + JSON.stringify(gazetteerHit)}
          gazetteerHit={gazetteerHit}
        />
        {showLandParcelChooser ? (
          <LandParcelChooser
            setGazetteerHit={setGazetteerHit}
            setOverlayFeature={setOverlayFeature}
            setShowLandParcelChooser={setShowLandParcelChooser}
          />
        ) : (
          <GazetteerSearchControl
            mapRef={refRoutedMap}
            gazetteerHit={gazetteerHit}
            setGazetteerHit={setGazetteerHit}
            gazeteerHitTrigger={gazetteerHitTrigger}
            overlayFeature={overlayFeature}
            setOverlayFeature={setOverlayFeature}
            gazData={gazData}
            enabled={gazData.length > 0}
            pixelwidth={500}
            placeholder={gazetteerSearchPlaceholder}
            tertiaryAction={() => {
              setShowLandParcelChooser(true);
            }}
            tertiaryActionIcon={faF}
            tertiaryActionTooltip="Flurstücksuche"
          />
        )}

        {showBackground && (
          <>
            <BackgroundLayers
              activeBackgroundLayer={activeBackgroundLayer}
              opacities={backgroundLayerOpacities}
            />
            <AdditionalLayers
              shownIn={shownIn}
              jwt={jwt}
              mapRef={refRoutedMap}
              activeLayers={activeAdditionalLayers}
              opacities={additionalLayerOpacities}
              onHoverUpdate={(featureproperties) => {
                dispatch(setHoveredObject(featureproperties));
              }}
              onGraphqlLayerStatus={(status) => {
                dispatch(setGraphqlStatus(status));
              }}
              openKassenzeichen={(kassenzeichen) => {
                console.log('open kassenzeichen', kassenzeichen);
              }}
            />
          </>
        )}
        {showVirtualCityOverlay && (
          <Overlay
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            mapRef={refRoutedMap}
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
                    const map = refRoutedMap.current.leafletMap.leafletElement;
                    const bb = getBoundsForFeatureArray([feature]);
                    // const { center, zoom } = getCenterAndZoomForBounds(map, bb);
                    // setUrlParams((prev) => {
                    //   prev.set("zoom", zoom);
                    //   prev.set("lat", center.lat);
                    //   prev.set("lng", center.lng);
                    //   return prev;
                    // });
                    if (map && bb) {
                      map.fitBounds(bb);
                    }
                  } else {
                    switch (feature.featureType) {
                      case 'flaeche': {
                        dispatch(storeFlaechenId(feature.id));
                        dispatch(setFlaechenSelected({ id: feature.id }));

                        break;
                      }
                      case 'front': {
                        dispatch(storeFrontenId(feature.properties.id));
                        dispatch(
                          setFrontenSelected({ id: feature.properties.id })
                        );
                        break;
                      }
                      case 'general': {
                        dispatch(
                          setGeneralGeometrySelected({
                            id: feature.properties.id,
                          })
                        );
                        break;
                      }
                      default: {
                        console.log(
                          'no featureClickHandler set',
                          e.target.feature
                        );
                      }
                    }
                  }
                })
              }
            />
          )}
      </RoutedMap>
      <Toolbar />
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
