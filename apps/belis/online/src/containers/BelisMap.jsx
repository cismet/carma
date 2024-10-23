import React, { useContext, useEffect, useRef, useState } from 'react';
import { MappingConstants, RoutedMap } from 'react-cismap';
import { TopicMapStylingContext } from 'react-cismap/contexts/TopicMapStylingContextProvider';
import GazetteerHitDisplay from 'react-cismap/GazetteerHitDisplay';
import ProjSingleGeoJson from 'react-cismap/ProjSingleGeoJson';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';

import BelisFeatureCollection from '../components/app/FeatureCollection';
import FocusRectangle from '../components/app/FocusRectangle';
import InfoBox from '../components/commons/InfoBox';
import InfoPanel from '../components/commons/secondaryinfo/SecondaryInfo';
import PaleOverlay from '../components/leaflet/PaleOverlay';
import { modifyQueryPart } from '../core/commons/routingHelper';
import { convertBounds2BBox } from '../core/helper/gisHelper';
import { CONNECTIONMODE, getConnectionMode } from '../core/store/slices/app';
import { getBackground } from '../core/store/slices/background';
import {
  getFeatureCollection,
  getFeatureCollectionMode,
  getGazetteerHit,
  getOverlayFeature,
  getSelectedFeature,
  isInFocusMode,
  isSecondaryInfoVisible,
  loadObjects,
  MODES,
  setSelectedFeature,
} from '../core/store/slices/featureCollection';
import { setMapRef } from '../core/store/slices/map';
import { setBounds } from '../core/store/slices/mapInfo';
import { isPaleModeActive } from '../core/store/slices/paleMode';
import { getLoadingState, initIndex } from '../core/store/slices/spatialIndex';
import { getZoom, setZoom } from '../core/store/slices/zoom';

//---

const BelisMap = ({ refRoutedMap, width, height, jwt }) => {
  const dispatch = useDispatch();
  const mapRef = refRoutedMap?.current?.leafletMap?.leafletElement;
  const blockingTime = 1000;
  const [blockLoading, setBlockLoading] = useState(false);
  const [indexInitialized, setIndexInitialized] = useState(false);
  const [indexInitializationRequested, setIndexInitializationRequested] =
    useState(false);

  const { selectedBackground, backgroundConfigurations } = useContext(
    TopicMapStylingContext
  );

  const timeoutHandlerRef = useRef(null);

  useEffect(() => {
    if (mapRef) {
      dispatch(setMapRef(mapRef));
      if (mapRef.attributionControl) {
        mapRef.attributionControl.setPrefix('');
      }
      mapRef.on('movestart', () => {
        setBlockLoading(true);
      });
      mapRef.on('moveend', () => {
        setBlockLoading(true);
        window.clearTimeout(timeoutHandlerRef.current);
        timeoutHandlerRef.current = window.setTimeout(() => {
          setBlockLoading(false);
        }, blockingTime);
      });
      mapRef.on('zoomstart', () => {
        setBlockLoading(true);
      });
      mapRef.on('zoomend', () => {
        setBlockLoading(true);
        window.clearTimeout(timeoutHandlerRef.current);
        timeoutHandlerRef.current = window.setTimeout(() => {
          setBlockLoading(false);
        }, blockingTime);
      });
    }
  }, [mapRef]);

  const [mapBoundsAndSize, setMapBoundsAndSize] = useState();

  const boundsFromMapRef = mapRef?.getBounds() || null;
  const sizeFromMapRef = mapRef?.getSize() || null;

  useEffect(() => {
    setMapBoundsAndSize((old) => {
      const mapBounds = mapRef?.getBounds();
      const mapSize = mapRef?.getSize();
      if (
        old === undefined ||
        JSON.stringify(old.mapBounds) !== JSON.stringify(mapBounds) ||
        JSON.stringify(old.mapSize) !== JSON.stringify(mapSize)
      ) {
        old = {
          mapBounds,
          mapSize,
        };
        dispatch(setBounds(mapBounds));
      }
      return old;
    });
  }, [mapRef, sizeFromMapRef, boundsFromMapRef]);

  const mapStyle = {
    height,
    width,
    cursor: 'pointer',
    clear: 'both',
    display: 'flex',
  };
  const featureCollection = useSelector(getFeatureCollection);
  const inFocusMode = useSelector(isInFocusMode);
  const fcMode = useSelector(getFeatureCollectionMode);
  const secondaryInfoVisible = useSelector(isSecondaryInfoVisible);
  const selectedFeature = useSelector(getSelectedFeature);
  const featureCollectionMode = useSelector(getFeatureCollectionMode);
  const overlayFeature = useSelector(getOverlayFeature);
  const gazetteerHit = useSelector(getGazetteerHit);
  const loadingState = useSelector(getLoadingState);

  const connectionMode = useSelector(getConnectionMode);
  const navigate = useNavigate();
  const browserlocation = useLocation();

  const zoom = useSelector(getZoom);

  const inPaleMode = useSelector(isPaleModeActive);
  const background = useSelector(getBackground);

  const urlSearchParams = new URLSearchParams(browserlocation.search);

  let backgroundsFromMode;
  try {
    backgroundsFromMode = backgroundConfigurations[selectedBackground].layerkey;
  } catch (e) {}

  const _backgroundLayers = backgroundsFromMode || 'rvrGrau@40';

  //we have 2 backgrounds, one redux background state (important for persistence)
  // useEffect(() => {
  //   const key = background;
  //   if (selectedBackground !== backgrounds[key]) {
  //     setSelectedBackground(backgrounds[key]);
  //   }
  // }, [inPaleMode, background, selectedBackground, setSelectedBackground, dispatch]);

  const { mapSize, mapBounds } = mapBoundsAndSize || {};

  //                 __              _ _
  //   __ _  ___    / _| ___  _ __  (_) |_
  //  / _` |/ _ \  | |_ / _ \| '__| | | __|
  // | (_| | (_) | |  _| (_) | |    | | |_
  //  \__, |\___/  |_|  \___/|_|    |_|\__|
  //  |___/
  useEffect(() => {
    // console.log("xxx go for it", {
    //   mapBounds,
    //   mapSize,
    //   blockLoading,
    //   indexInitialized,
    //   connectionMode,
    // });

    if (
      blockLoading === false &&
      (indexInitialized || connectionMode !== CONNECTIONMODE.FROMCACHE)
    ) {
      if (mapBounds && mapSize) {
        const boundingBox = convertBounds2BBox(mapBounds);

        const z = urlSearchParams.get('zoom');
        if (zoom !== z) {
          dispatch(setZoom(z));
        }
        if (featureCollectionMode === MODES.OBJECTS) {
          dispatch(
            loadObjects({
              boundingBox,
              inFocusMode,
              zoom: z,
              jwt: jwt,
              force: true,
            })
          ); //here force=true because of problem when initially loading after switching to cache mode
        } else {
          // console.log("xxx no map for you (mapBounds && mapSize)", mapBounds, mapSize);
        }
      }
    } else {
      // console.log(
      //   "xxx no map for you (blockLoading===false,indexInitialized,isSecondaryCacheReady)",
      //   blockLoading === false,
      //   indexInitialized,
      //   isSecondaryCacheReady
      // );
    }
  }, [
    mapBounds,
    mapSize,
    blockLoading,
    indexInitialized,
    connectionMode,
    featureCollectionMode,
  ]);

  // initalize the index in CACHEMODE when the loadingstate is undefined
  useEffect(() => {
    // console.log("should i initialize index?");

    if (connectionMode === CONNECTIONMODE.FROMCACHE) {
      // console.log("should i initialize index in CONNECTIONMODE.FROMCACHE");

      if (loadingState === undefined || indexInitialized === false) {
        // console.log("should i initialize index in CONNECTIONMODE.FROMCACHE: yes will do");
        if (indexInitializationRequested === false) {
          setIndexInitializationRequested(true);
          dispatch(
            initIndex(() => {
              setIndexInitialized(true);
            })
          );
        }
      } else {
        // console.log(
        //   "should i initialize index in CONNECTIONMODE.FROMCACHE: no will not",
        //   loadingState
        // );
      }
    }
  }, [dispatch, connectionMode, loadingState]);

  //Symbolcolors from nightmode
  let symbolColor;
  if (background === 'nightplan') {
    symbolColor = '#ffffff';
  } else {
    symbolColor = '#000000';
  }

  return (
    <RoutedMap
      editable={false}
      style={mapStyle}
      key={'leafletRoutedMap'}
      referenceSystem={MappingConstants.crs3857}
      referenceSystemDefinition={MappingConstants.proj4crs3857def}
      ref={refRoutedMap}
      layers=""
      doubleClickZoom={false}
      onclick={(e) => {}}
      ondblclick={(e) => {
        try {
          const classesString = e.originalEvent.path[0].getAttribute('class');

          if (classesString) {
            const classes = classesString.split(' ');

            if (
              classes.includes('leaflet-gl-layer') ||
              classes.includes('leaflet-container')
            ) {
              dispatch(setSelectedFeature(null));
            } else {
              // console.log("classes", classesString);
            }
          }
        } catch (e) {
          console.log('error in dbl click', e);
        }
      }}
      autoFitProcessedHandler={() =>
        this.props.mappingActions.setAutoFit(false)
      }
      backgroundlayers={_backgroundLayers}
      urlSearchParams={urlSearchParams}
      fullScreenControlEnabled={true}
      locateControlEnabled={true}
      minZoom={11}
      maxZoom={22}
      zoomSnap={0.5}
      zoomDelta={0.5}
      fallbackPosition={{
        lat: 51.272399,
        lng: 7.199712,
      }}
      fallbackZoom={18}
      locationChangedHandler={(location) => {
        navigate(
          browserlocation.pathname +
            modifyQueryPart(browserlocation.search, location)
        );
      }}
      boundingBoxChangedHandler={(boundingBox) => {
        // console.log("xxx boundingBox Changed", boundingBox);
      }}
    >
      <BelisFeatureCollection
        style={{ zIndex: 600 }}
        featureCollection={featureCollection}
        fgColor={symbolColor}
      ></BelisFeatureCollection>
      {/* <DebugFeature feature={focusBoundingBox} /> */}

      <FocusRectangle
        inFocusMode={inFocusMode && fcMode === MODES.OBJECTS}
        mapWidth={mapStyle.width}
        mapHeight={mapStyle.height}
      />

      {secondaryInfoVisible && <InfoPanel />}

      {selectedFeature !== undefined && selectedFeature !== null && (
        <InfoBox refRoutedMap={refRoutedMap} />
      )}

      {inPaleMode && <PaleOverlay />}
      {overlayFeature && (
        <ProjSingleGeoJson
          key={JSON.stringify(overlayFeature)}
          geoJson={overlayFeature}
          masked={true}
          mapRef={refRoutedMap}
        />
      )}
      {gazetteerHit && (
        <GazetteerHitDisplay
          key={'gazHit' + JSON.stringify(gazetteerHit)}
          gazetteerHit={gazetteerHit}
        />
      )}
    </RoutedMap>
  );
};

export default BelisMap;
