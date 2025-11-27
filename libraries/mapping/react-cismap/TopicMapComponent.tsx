import React, { useContext, useEffect, useRef, useState } from "react";

import md5 from "md5";
import Button from "react-bootstrap/Button";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";

import Loadable from "react-loading-overlay";
import Icon from "react-cismap/commons/Icon";
import ProjSingleGeoJson from "react-cismap/ProjSingleGeoJson";
import DefaultAppMenu from "react-cismap/topicmaps/menu/DefaultAppMenu";
import { RoutedMap } from "react-cismap";
import { AUTO_FIT_MODE_STRICT, crs25832, crs3857 } from "../../utils/constants";
import { proj4crs3857def } from "@carma-mapping/utils";
import {
  TopicMapContext,
  TopicMapDispatchContext,
} from "../../contexts/TopicMapContextProvider";
import { UIContext, UIDispatchContext } from "../../contexts/UIContextProvider";
import GazetteerHitDisplay from "./GazetteerHitDisplay";
import GazetteerSearchControl from "./GazetteerSearchControl";
import PhotoLightBox from "./PhotoLightbox";
import TitleBox from "./TitleBox";
import getLayers from "./tools/layerFactory";
import { modifyQueryPart } from "./tools/routingHelper";
import { TopicMapStylingContext } from "../../contexts/TopicMapStylingContextProvider";
import { ResponsiveTopicMapContext } from "../../contexts/ResponsiveTopicMapContextProvider";
import { Control } from "@carma-mapping/map-controls-layout";

export const TopicMapComponent = (props) => {
  const infoBoxRef = useRef(null);
  let {
    modalMenu,
    showModalMenuOverride = false,
    statusPostfix = "",
    loadingStatus = undefined,
    pendingLoader = 0,
    noInitialLoadingText = false,
    initialLoadingText = "Laden der Daten ...",
    minZoom,
    maxZoom,
    mapStyle,
    homeCenter,
    homeZoom,
    home,
    ondblclick = () => {},
    onclick = () => {},
    locationChangedHandler = () => {},
    outerLocationChangedHandlerExclusive = false,
    pushToHistory,
    autoFitBounds = false,
    autoFitMode = AUTO_FIT_MODE_STRICT,
    autoFitBoundsTarget = null,
    setAutoFit = () => {},
    urlSearchParams,
    mappingBoundsChanged = (boundingbox) => {},
    backgroundlayers,
    fullScreenControl = true,
    locatorControl = false,
    // overlayFeature = undefined,
    // setOverlayFeature = () => {},
    // // gazetteerHit = undefined,
    // setGazetteerHit =undefined,
    gazData = [],

    searchControlWidth = 300,
    infoStyle,
    infoBoxBottomMargin,
    infoBox = <div />,
    secondaryInfoBoxElements = [],
    secondaryInfoBoxControlPosition,
    applicationMenuTooltipString = "Einstellungen | Anleitung",
    showModalApplicationMenu = undefined,
    applicationMenuIconname = "bars",
    secondaryInfo,
    gazetteerSearchPlaceholder,
    photoLightBox = true,
    attributionControl = false,
    gazetteerHitTrigger,
    gazetteerSearchControl = true,
    hamburgerMenu = true,
    zoomControls = true,
    leafletMapProps = {},
    gazetteerSearchControlProps = {},
    gazetteerSearchComponent,
    zoomSnap = 1,
    zoomDelta = 1,
    mapkey = "mapKey",
    editable = false,
  } = props;
  const {
    history,
    referenceSystem,
    referenceSystemDefinition,
    maskingPolygon,
    realRoutedMapRef: leafletRoutedMapRef,
  } = useContext(TopicMapContext);
  const {
    backgroundModes,
    selectedBackground,
    baseLayerConf,
    backgroundConfigurations,
    additionalLayerConfiguration,
    activeAdditionalLayerKeys,
  } = useContext(TopicMapStylingContext);

  // const { offlineCacheConfig, vectorLayerOfflineEnabled, readyToUse: offlineReadyToUse } =
  //   useContext(OfflineLayerCacheContext) || {};

  const [url, setUrl] = useState(undefined);
  useEffect(() => {
    history.listen(({ action, location }) => {
      setUrl(history.location.search);
    });
  }, []);

  let featureCollectionDisplay;

  let _urlSearchParams;
  let _pushToHistory =
    pushToHistory ||
    ((url) => {
      history.push(url);
    });
  if (urlSearchParams === undefined) {
    _urlSearchParams = new URLSearchParams(url || history.location.search);
  } else {
    _urlSearchParams = urlSearchParams;
  }
  let backgroundsFromMode;
  try {
    backgroundsFromMode = backgroundConfigurations[selectedBackground].layerkey;
  } catch (e) {}

  const _backgroundLayers =
    backgroundlayers || backgroundsFromMode || "rvrGrau@40";

  const [gazetteerHit, setGazetteerHit] = useState(null);
  const [overlayFeature, setOverlayFeature] = useState(null);

  const { setBoundingBox, setLocation, setRoutedMapRef } = useContext(
    TopicMapDispatchContext
  );
  const { responsiveState, searchBoxPixelWidth, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const uiContext = useContext(UIContext);
  const { appMenuVisible, appMenuActiveMenuSelection, menuCounter } = uiContext;
  const { setAppMenuVisible, setAppMenuActiveMenuSection } =
    useContext(UIDispatchContext);

  useEffect(() => {
    if (leafletRoutedMapRef.current !== null) {
      setRoutedMapRef(leafletRoutedMapRef.current);
    }
  }, [leafletRoutedMapRef, setRoutedMapRef]);

  const _mapStyle = {
    cursor: "pointer",
    ...mapStyle,
  };
  if (_mapStyle.width === undefined && _mapStyle.height === undefined) {
    if (windowSize) {
      _mapStyle.width = windowSize.width;
      _mapStyle.height = windowSize.height;
    } else {
      _mapStyle.width = window.innerWidth;
      _mapStyle.height = window.innerHeight;
    }
  }
  let _showModalApplicationMenu;
  if (showModalApplicationMenu !== undefined) {
    _showModalApplicationMenu = showModalApplicationMenu;
  } else {
    _showModalApplicationMenu = () => {
      setAppMenuVisible(true);
    };
  }

  //responsive behaviour
  let widthRight = infoBox.props.pixelwidth;
  let width = _mapStyle.width;

  let widthLeft = searchControlWidth;
  let _infoStyle = {
    opacity: "0.9",
    width: infoBox.props.pixelwidth,
  };

  let _homeCenter, _homeZoom, _minZoom, _maxZoom;

  if (homeCenter) {
    _homeCenter = homeCenter;
  } else if (home?.center) {
    _homeCenter = home.center;
  } else {
    _homeCenter = [51.25861849982617, 7.15101022370511];
  }

  if (homeZoom) {
    _homeZoom = homeZoom;
  } else if (home?.zoom) {
    _homeZoom = home.zoom;
  } else {
    if (referenceSystem === crs25832) {
      _homeZoom = 9;
      _minZoom = 5;
      _maxZoom = 20;
    } else {
      _homeZoom = 12;
      _minZoom = 10;
      _maxZoom = 22;
    }
  }

  const _modalMenu = modalMenu || <DefaultAppMenu />;

  return (
    <div>
      {_modalMenu}
      {secondaryInfo !== undefined && secondaryInfo}
      <Loadable
        active={pendingLoader > 0 && !noInitialLoadingText}
        spinner
        text={initialLoadingText + " " + statusPostfix + "..."}
      >
        <div key={"mapKey." + mapkey}>
          {photoLightBox && <PhotoLightBox />}
          <TitleBox />
          <RoutedMap
            key={"leafletRoutedMap"}
            layerKeyPostfix={
              md5(additionalLayerConfiguration || "") +
              "." +
              JSON.stringify(activeAdditionalLayerKeys)
            }
            referenceSystem={referenceSystem || crs3857}
            referenceSystemDefinition={
              referenceSystemDefinition || proj4crs3857def
            }
            ref={leafletRoutedMapRef}
            baseLayerConf={baseLayerConf}
            minZoom={minZoom || _minZoom}
            maxZoom={maxZoom || _maxZoom}
            zoomControlEnabled={zoomControls}
            layers=""
            style={_mapStyle}
            fallbackPosition={{
              lat: _homeCenter[0],
              lng: _homeCenter[1],
            }}
            ondblclick={ondblclick}
            onclick={onclick}
            locationChangedHandler={(location) => {
              if (!outerLocationChangedHandlerExclusive) {
                setLocation(location);
                const q = modifyQueryPart(history.location.search, location);
                _pushToHistory(q);
              }
              locationChangedHandler(location);
            }}
            autoFitConfiguration={{
              autoFitBounds: autoFitBounds,
              autoFitMode: autoFitMode,
              autoFitBoundsTarget: autoFitBoundsTarget,
            }}
            autoFitProcessedHandler={() => setAutoFit(false)}
            urlSearchParams={_urlSearchParams}
            boundingBoxChangedHandler={(bbox) => {
              setBoundingBox(bbox);
              mappingBoundsChanged(bbox);
              //localMappingBoundsChanged(bbox);
            }}
            backgroundlayers={_backgroundLayers}
            fallbackZoom={_homeZoom}
            fullScreenControlEnabled={fullScreenControl}
            locateControlEnabled={locatorControl}
            attributionControl={attributionControl}
            // offlineReadyToUse={offlineReadyToUse}
            leafletMapProps={leafletMapProps}
            zoomSnap={zoomSnap}
            zoomDelta={zoomDelta}
            editable={editable}
          >
            {overlayFeature && (
              <ProjSingleGeoJson
                key={JSON.stringify(overlayFeature)}
                geoJson={overlayFeature}
                masked={true}
                maskingPolygon={maskingPolygon}
                mapRef={leafletRoutedMapRef}
              />
            )}
            <GazetteerHitDisplay
              key={"gazHit" + JSON.stringify(gazetteerHit)}
              gazetteerHit={gazetteerHit}
            />
            {featureCollectionDisplay}
            {gazetteerSearchControl && (
              <GazetteerSearchControl
                mapRef={leafletRoutedMapRef}
                gazetteerHit={gazetteerHit}
                setGazetteerHit={setGazetteerHit}
                gazeteerHitTrigger={gazetteerHitTrigger}
                overlayFeature={overlayFeature}
                setOverlayFeature={setOverlayFeature}
                gazData={gazData}
                enabled={gazData.length > 0}
                pixelwidth={searchControlWidth}
                placeholder={gazetteerSearchPlaceholder}
                {...gazetteerSearchControlProps}
                gazetteerSearchComponent={gazetteerSearchComponent}
              />
            )}

            {infoBox}

            {hamburgerMenu && (
              <Control order={10} position="topright">
                <OverlayTrigger
                  placement="left"
                  overlay={
                    <Tooltip style={{ zIndex: 20000000 }} id="helpTooltip">
                      {applicationMenuTooltipString}
                    </Tooltip>
                  }
                >
                  <Button
                    variant="light"
                    style={{
                      backgroundImage:
                        "linear-gradient(to bottom,#fff 0,#e0e0e0 100%)",
                      borderColor: "#CCCCCC",
                    }}
                    id="cmdShowModalApplicationMenu"
                    onClick={() => {
                      _showModalApplicationMenu();
                    }}
                  >
                    <Icon name={applicationMenuIconname} />
                  </Button>
                </OverlayTrigger>
              </Control>
            )}
            <div
              key={
                _backgroundLayers + "." + _urlSearchParams.get("mapStyle")
                // + "." +
                // JSON.stringify(activeAdditionalLayerKeys || "") +
              }
            >
              {activeAdditionalLayerKeys !== undefined &&
                additionalLayerConfiguration !== undefined &&
                activeAdditionalLayerKeys?.length > 0 &&
                activeAdditionalLayerKeys.map((activekey, index) => {
                  const layerConf = additionalLayerConfiguration[activekey];
                  if (layerConf?.layer) {
                    return layerConf.layer;
                  } else if (layerConf?.layerkey) {
                    const layers = getLayers(layerConf.layerkey);
                    return layers;
                  }
                })}
            </div>
            {props.children}
          </RoutedMap>
        </div>
      </Loadable>
    </div>
  );
};
export default TopicMapComponent;
