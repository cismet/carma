import 'react-cismap/topicMaps.css';
import 'leaflet/dist/leaflet.css';

import { Card, Tooltip } from 'antd';
import PropTypes from 'prop-types';
import { useContext, useEffect, useRef, useState } from 'react';
import { flaechen } from '../../stories/_data/rathausKassenzeichenfeatureCollection';
import { MappingConstants, RoutedMap } from 'react-cismap';
import {
  TopicMapStylingContext,
  TopicMapStylingDispatchContext,
} from 'react-cismap/contexts/TopicMapStylingContextProvider';
import GazetteerSearchControl from 'react-cismap/GazetteerSearchControl';
import GazetteerHitDisplay from 'react-cismap/GazetteerHitDisplay';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  convertLatLngToXY,
  createQueryGeomFromBB,
} from '../../tools/mappingTools';
import {
  getIsLoadingGeofields,
  getIsLoadingKassenzeichenWithPoint,
  searchForGeoFields,
  searchForKassenzeichenWithPoint,
} from '../../store/slices/search';
import {
  getLockMap,
  //   getLockScale,
  getShowBackground,
  getShowCurrentFeatureCollection,
  setFeatureCollection,
  setLeafletElement,
  setLockMap,
  //   setLockScale,
  setShowBackground,
  setShowCurrentFeatureCollection,
  setToolbarProperties,
} from '../../store/slices/mapping';
import { useDispatch, useSelector } from 'react-redux';
import { ScaleControl } from 'react-leaflet';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faF,
  faLock,
  faLockOpen,
  faPlane,
  faImage as solidImage,
} from '@fortawesome/free-solid-svg-icons';
import { faImage as regularImage } from '@fortawesome/free-regular-svg-icons';
import getLayers from 'react-cismap/tools/layerFactory';
import StyledWMSTileLayer from 'react-cismap/StyledWMSTileLayer';
import { getArea25832 } from '../../tools/kassenzeichenMappingTools';
import Overlay from './Overlay';

import { getGazData } from '../../store/slices/gazData';
import Toolbar from './Toolbar';
import LandParcelChooser from './LandParcelChooser';
import Dot from './Dot';
import { LoadingOutlined } from '@ant-design/icons';
import FeatureCollection from './FeatureCollection';
import { getAdditionalLayerOpacities } from '../../store/slices/settings';
const mockExtractor = (input) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: flaechen,
  };
};

const Map = ({
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
  const [fallback, setFallback] = useState({});
  const [showVirtualCityOverlay, setShowVirtualCityOverlay] = useState(false);
  const [infoText, setInfoText] = useState('');
  const showCurrentFeatureCollection = useSelector(
    getShowCurrentFeatureCollection
  );
  const gazData = useSelector(getGazData);

  const lockMap = useSelector(getLockMap);
  //   const lockScale = useSelector(getLockScale);
  const showBackground = useSelector(getShowBackground);
  const opacities = useSelector(getAdditionalLayerOpacities);
  const isLoadingGeofields = useSelector(getIsLoadingGeofields);
  const isLoadingKassenzeichenWithPoint = useSelector(
    getIsLoadingKassenzeichenWithPoint
  );
  const [overlayFeature, setOverlayFeature] = useState(null);
  const [gazetteerHit, setGazetteerHit] = useState(null);
  const gazetteerHitTrigger = () => {
    console.log('gazetteerHitTrigger');
  };
  const searchControlWidth = 500;
  const gazetteerSearchPlaceholder = undefined;

  const data = extractor(dataIn);
  const padding = 5;
  const headHeight = 37;
  const toolBarHeight = 34;
  const cardRef = useRef(null);
  const [mapWidth, setMapWidth] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);
  const [showLandParcelChooser, setShowLandParcelChooser] = useState(false);
  const {
    backgroundModes,
    selectedBackground,
    baseLayerConf,
    backgroundConfigurations,
    additionalLayerConfiguration,
    activeAdditionalLayerKeys,
  } = useContext(TopicMapStylingContext);

  const {
    setSelectedBackground,
    setNamedMapStyle,
    setActiveAdditionalLayerKeys,
  } = useContext(TopicMapStylingDispatchContext);

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
  try {
    backgroundsFromMode = backgroundConfigurations[selectedBackground].layerkey;
  } catch (e) {}

  const _backgroundLayers = backgroundsFromMode || 'rvrGrau@40';

  useEffect(() => {
    setMapWidth(cardRef?.current?.offsetWidth);
    setMapHeight(cardRef?.current?.offsetHeight);

    const setSize = () => {
      setMapWidth(cardRef?.current?.offsetWidth);
      setMapHeight(cardRef?.current?.offsetHeight);
    };

    window.addEventListener('resize', setSize);

    return () => window.removeEventListener('resize', setSize);
  }, []);

  let refRoutedMap = useRef(null);

  const mapStyle = {
    width: mapWidth - 2.5 * padding,
    height: mapHeight - 2 * padding - headHeight - toolBarHeight,
    cursor: 'pointer',
    clear: 'both',
    zIndex: 1,
  };

  const defaults = {
    maxWidth: 200,
    metric: true,
    imperial: false,
    updateWhenIdle: false,
    position: 'topleft',
  };

  useEffect(() => {
    if (refRoutedMap.current) {
      const map = refRoutedMap.current.leafletMap.leafletElement;
      dispatch(setLeafletElement(map));
    }
  }, [refRoutedMap]);

  return (
    <Card
      size="small"
      hoverable={false}
      title={<span className="text-lg">Karte</span>}
      extra={
        <div className="flex items-center gap-4">
          {(isLoadingGeofields || isLoadingKassenzeichenWithPoint) && (
            <LoadingOutlined />
          )}
          {/* <Tooltip title="Kartenausschnitt für dieses Kassenzeichen beibehalten">
            <div
              className="relative flex cursor-pointer items-center justify-center"
              onClick={() => dispatch(setLockScale(!lockScale))}
            >
              <FontAwesomeIcon
                icon={lockScale ? faLock : faLockOpen}
                className={`h-6 ${lockScale && 'pr-[5.5px]'}`}
              />
              <span className="absolute -bottom-[10px] right-0 text-primary font-bold text-lg">
                K
              </span>
            </div>
          </Tooltip> */}
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
        width: width,
        height: height,
      }}
      bodyStyle={{ padding }}
      headStyle={{ backgroundColor: 'white' }}
      type="inner"
      ref={cardRef}
    >
      <RoutedMap
        editable={false}
        style={mapStyle}
        key={'leafletRoutedMap'}
        backgroundlayers={showBackground ? _backgroundLayers : null}
        urlSearchParams={urlSearchParams}
        layers=""
        referenceSystem={MappingConstants.crs3857}
        referenceSystemDefinition={MappingConstants.proj4crs3857def}
        ref={refRoutedMap}
        minZoom={11}
        maxZoom={25}
        zoomSnap={0.5}
        zoomDelta={0.5}
        fallbackPosition={{
          lat:
            urlSearchParamsObject?.lat ??
            fallback?.position?.lat ??
            51.272570027476256,
          lng:
            urlSearchParamsObject?.lng ??
            fallback?.position?.lng ??
            7.19963690266013,
        }}
        fallbackZoom={urlSearchParamsObject?.zoom ?? fallback.zoom ?? 17}
        locationChangedHandler={(location) => {
          const newParams = { ...paramsToObject(urlParams), ...location };
          setUrlParams(newParams);
        }}
        boundingBoxChangedHandler={(boundingBox) => {
          boundingBoxChangedHandler(boundingBox);
          try {
            const bbPoly = createQueryGeomFromBB(boundingBox);
            const area = getArea25832(bbPoly);
            const maxAreaForSearch = 130000;
            if (area < maxAreaForSearch && area !== 0) {
              setInfoText('');
              dispatch(searchForGeoFields(bbPoly));
            } else {
              setInfoText(
                'Zur Anzeige aller Flächen und Fronten, bitte eine größere Zoomstufe wählen'
              );
              dispatch(setToolbarProperties({}));
              dispatch(setFeatureCollection(undefined));
            }
          } catch (e) {
            console.log('error in boundingBoxChangedHandler', e);
          }
        }}
        ondblclick={(event) => {
          //if data contains a ondblclick handler, call it
          if (data.ondblclick) {
            data.ondblclick(event);
          } else {
            const xy = convertLatLngToXY(event.latlng);
            dispatch(
              searchForKassenzeichenWithPoint(
                xy[0],
                xy[1],
                urlParams,
                setUrlParams
              )
            );
          }
        }}
      >
        <ScaleControl {...defaults} position="bottomright" />
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
          <>
            <GazetteerSearchControl
              mapRef={refRoutedMap}
              gazetteerHit={gazetteerHit}
              setGazetteerHit={setGazetteerHit}
              gazeteerHitTrigger={gazetteerHitTrigger}
              overlayFeature={overlayFeature}
              setOverlayFeature={setOverlayFeature}
              gazData={gazData}
              enabled={gazData.length > 0}
              pixelwidth={300}
              placeholder={gazetteerSearchPlaceholder}
              tertiaryAction={() => {
                setShowLandParcelChooser(true);
              }}
              tertiaryActionIcon={faF}
              tertiaryActionTooltip="Flurstücksuche"
            />
          </>
        )}
        {data.featureCollection &&
          data.featureCollection.length > 0 &&
          showCurrentFeatureCollection && (
            <FeatureCollection
              featureCollection={data.featureCollection}
              styler={data.styler}
              markerStyle={data.markerStyle}
              showMarkerCollection={data.showMarkerCollection || false}
              featureClickHandler={data.featureClickHandler}
            />
          )}

        {children}

        {activeAdditionalLayerKeys !== undefined &&
          additionalLayerConfiguration !== undefined &&
          activeAdditionalLayerKeys?.length > 0 &&
          showBackground &&
          activeAdditionalLayerKeys.map((activekey, index) => {
            const layerConf = additionalLayerConfiguration[activekey];
            if (layerConf?.props) {
              return (
                <StyledWMSTileLayer
                  {...layerConf.props}
                  maxZoom={25}
                  opacity={opacities[activekey].toFixed(2) || 0.7}
                />
              );
            } else if (layerConf?.layerkey) {
              const layers = getLayers(layerConf.layerkey);
              return layers;
            }
          })}
        {showVirtualCityOverlay && (
          <Overlay
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            mapRef={refRoutedMap}
          />
        )}
      </RoutedMap>
      <Toolbar infoText={infoText} />
    </Card>
  );
};
export default Map;

Map.propTypes = {
  /**
   * The width of the map
   */
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),

  /**
   * The height of the map
   */
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),

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
