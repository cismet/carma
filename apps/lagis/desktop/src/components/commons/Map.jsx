import { Card, Tooltip, Tag } from "antd";

import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GEMARKUNGEN } from "../ui/generalConstant";
import { useSearchParams } from "react-router-dom";
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
  setHasFittedBounds,
  setShowBackground,
  setShowCurrentFeatureCollection,
  setShowInspectMode,
} from "../../store/slices/mapping";
import { useDispatch, useSelector } from "react-redux";
import { FileImageOutlined, FileImageFilled } from "@ant-design/icons";
import { getBackgroundLibreLayers } from "./BackgroundLayers";
import { getAdditionalLibreLayers } from "./AdditionalLayers";
import {
  getActiveAdditionalLayers,
  getActiveBackgroundLayer,
  getAdditionalLayerOpacities,
  getBackgroundLayerOpacities,
  isMapLoading,
  setHoveredLandparcel,
  getSelectedTrueOrthoYear,
} from "../../store/slices/ui";
import { getJWT } from "../../store/slices/auth";
import HoveredLandparcelInfo from "./HoveredLandparcelInfo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBinoculars } from "@fortawesome/free-solid-svg-icons";
import {
  PointSearchButton,
  LibrePointSearch,
} from "@carma-appframeworks/alkis";
import { getShapeMode, storeShapeMode } from "../../store/slices/searchMode";
import {
  LibreMapSelectionContent,
  useGazData,
  useSelection,
} from "@carma-appframeworks/portals";
import proj4 from "proj4";
import { proj4crs3857def } from "react-cismap/constants/gis";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { isAreaType } from "@carma-commons/resources";
import { CarmaMap } from "@carma-mapping/core";
import {
  LibreContextProvider,
  zoom256as512,
  zoom512as256,
} from "@carma-mapping/engines/maplibre";
import {
  DrawModeControls,
  MeasurementHost,
  MeasurementsProvider,
} from "@carma-mapping/measurements";
import {
  applyFeatureCollectionLayers,
  buildFeatureCollectionGeoJSON,
  EMPTY_FEATURE_COLLECTION,
  FEATURE_COLLECTION_LAYER_IDS,
  FEATURE_INDEX_PROPERTY,
} from "../../core/tools/libreFeatures";
import { setLibreMapInstance } from "../../core/tools/libreMapRegistry";
import { MapLibrePrintPreview } from "@carma-mapping/print-core/maplibre";
import { buildLagisPrintLayers } from "../../core/tools/printLayers";
import PrintControl from "./PrintControl";
import {
  getDPI,
  getIfMapPrinted,
  getIsLoading,
  getOrientation,
  getPrintActive,
  getPrintName,
  getRedrawPreview,
  getScale,
  setIfMapPrinted,
  setIsLoading,
  setPrintActive,
  setPrintError,
  setRedrawPreview,
} from "../../store/slices/print";

const mockExtractor = (input) => {
  return {
    homeCenter: [51.27225612927373, 7.199918031692506],
    homeZoom: 16,
    featureCollection: [],
  };
};

/** ms between two hover queries against the rendered ALKIS features */
const HOVER_THROTTLE_MS = 100;

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
  const dispatch = useDispatch();
  const [, setUrlParams] = useSearchParams();
  const showCurrentFeatureCollection = useSelector(
    getShowCurrentFeatureCollection
  );
  const showBackground = useSelector(getShowBackground);
  const showInspectMode = useSelector(getShowInspectMode);
  const jwt = useSelector(getJWT);
  const mode = useSelector(getShapeMode);

  // Print preview state, see store/slices/print and PrintControl
  const printActive = useSelector(getPrintActive);
  const printOrientation = useSelector(getOrientation);
  const printScale = useSelector(getScale);
  const printDpi = useSelector(getDPI);
  const printName = useSelector(getPrintName);
  const printLoading = useSelector(getIsLoading);
  const printRedraw = useSelector(getRedrawPreview);
  const printIfMapPrinted = useSelector(getIfMapPrinted);

  const [libreMap, setLibreMap] = useState(null);
  // "none" keeps terra-draw in select mode: existing measurements stay
  // clickable, but no new geometry is drawn.
  const [drawMode, setDrawMode] = useState("none");

  const data = extractor(dataIn);
  const padding = 5;
  const headHeight = 37;
  const cardRef = useRef(null);

  const isMapLoadingValue = useSelector(isMapLoading);

  const hasFittedBounds = useSelector(getHasFittedBounds);

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
  };

  const handleLibreMapReady = useCallback((map) => {
    setLibreMap(map);
    setLibreMapInstance(map);
  }, []);

  useEffect(() => {
    return () => {
      setLibreMapInstance(null);
    };
  }, []);

  const backgroundLayerOpacities = useSelector(getBackgroundLayerOpacities);
  const additionalLayerOpacities = useSelector(getAdditionalLayerOpacities);
  const activeBackgroundLayer = useSelector(getActiveBackgroundLayer);
  const activeAdditionalLayers = useSelector(getActiveAdditionalLayers);
  const selectedTrueOrthoYear = useSelector(getSelectedTrueOrthoYear);

  // Background and additional layers were both rendered inside the
  // `showBackground` branch before, so hiding the background hides both.
  const libreLayers = useMemo(() => {
    if (!showBackground) {
      return [];
    }
    return [
      ...getBackgroundLibreLayers(
        activeBackgroundLayer,
        backgroundLayerOpacities,
        selectedTrueOrthoYear
      ),
      ...getAdditionalLibreLayers(
        activeAdditionalLayers,
        additionalLayerOpacities
      ),
    ];
  }, [
    showBackground,
    activeBackgroundLayer,
    backgroundLayerOpacities,
    selectedTrueOrthoYear,
    activeAdditionalLayers,
    additionalLayerOpacities,
  ]);

  // ---------------------------------------------------------------------
  // Feature collection
  // ---------------------------------------------------------------------

  const featureCollection = data?.featureCollection;

  // The extractors rebuild their feature array (and their styler closure) on
  // every render, so neither is usable as a memo dependency. The built GeoJSON
  // is therefore cached behind its own serialization: identity only changes
  // when the rendered result actually differs, which is what both the effect
  // below and MapLibre's source update need.
  const builtGeoJSON = buildFeatureCollectionGeoJSON(
    featureCollection,
    data?.styler
  );
  const builtSignature = JSON.stringify(builtGeoJSON);
  const geoJSONCacheRef = useRef({ signature: undefined, data: undefined });
  if (geoJSONCacheRef.current.signature !== builtSignature) {
    geoJSONCacheRef.current = { signature: builtSignature, data: builtGeoJSON };
  }
  const featureCollectionGeoJSON = showCurrentFeatureCollection
    ? geoJSONCacheRef.current.data
    : EMPTY_FEATURE_COLLECTION;

  // The source is added imperatively, so it has to be restored after every
  // style reload - CarmaMap's merged layer mode replaces the whole style
  // whenever the layer list changes.
  useEffect(() => {
    if (!libreMap) {
      return;
    }

    const apply = () =>
      applyFeatureCollectionLayers(libreMap, featureCollectionGeoJSON);

    apply();
    libreMap.on("styledata", apply);

    return () => {
      libreMap.off("styledata", apply);
    };
  }, [libreMap, featureCollectionGeoJSON]);

  const dataRef = useRef(data);
  dataRef.current = data;

  // Read inside the map handlers so switching draw mode does not re-register
  // them. While a measurement is being drawn the clicks belong to terra-draw.
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;

  // While the print rectangle is up the clicks belong to the preview.
  const printActiveRef = useRef(printActive);
  printActiveRef.current = printActive;

  // Measuring, the point search and the print rectangle claim the same
  // gestures, so opening the preview leaves both modes.
  useEffect(() => {
    if (printActive) {
      setDrawMode("none");
      dispatch(storeShapeMode("default"));
    }
  }, [printActive, dispatch]);

  // ---------------------------------------------------------------------
  // Click / double click on the feature collection
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!libreMap) {
      return;
    }

    const handleClick = (e) => {
      if (drawModeRef.current !== "none" || printActiveRef.current) {
        return;
      }
      const currentData = dataRef.current;
      const renderedLayerIds = FEATURE_COLLECTION_LAYER_IDS.filter((layerId) =>
        libreMap.getLayer(layerId)
      );
      if (renderedLayerIds.length === 0) {
        return;
      }
      const hits = libreMap.queryRenderedFeatures(e.point, {
        layers: renderedLayerIds,
      });
      if (hits.length === 0) {
        return;
      }

      const featureIndex = hits[0].properties?.[FEATURE_INDEX_PROPERTY];
      const feature = currentData?.featureCollection?.[featureIndex];
      if (!feature) {
        return;
      }

      if (currentData.featureClickHandler) {
        currentData.featureClickHandler({ target: { feature } });
        return;
      }

      if (feature.selected) {
        const bb = getBoundsForFeatureArray([feature]);
        if (!bb) {
          return;
        }
        const { center, zoom } = getCenterAndZoomForBounds(libreMap, bb);
        setUrlParams((prev) => {
          if (zoom !== undefined) {
            // the hash params store Leaflet style (256px tile) zoom levels
            prev.set("zoom", zoom512as256(zoom));
          }
          prev.set("lat", center.lat);
          prev.set("lng", center.lng);
          return prev;
        });
        return;
      }

      switch (feature.featureType) {
        case "flaeche": {
          dispatch(setFlaechenSelected({ id: feature.id }));
          break;
        }
        case "front": {
          dispatch(setFrontenSelected({ id: feature.properties.id }));
          break;
        }
        case "general": {
          dispatch(setGeneralGeometrySelected({ id: feature.properties.id }));
          break;
        }
        default: {
          onClickHandler(feature);
        }
      }
    };

    const handleDoubleClick = (e) => {
      if (drawModeRef.current !== "none" || printActiveRef.current) {
        return;
      }
      const currentData = dataRef.current;
      if (!currentData?.ondblclick) {
        return;
      }
      // the page handlers only read `latlng`, which LngLat already satisfies
      currentData.ondblclick(
        { ...e, latlng: e.lngLat },
        libreMap,
        currentData.featureCollection
      );
    };

    libreMap.on("click", handleClick);
    libreMap.on("dblclick", handleDoubleClick);

    return () => {
      libreMap.off("click", handleClick);
      libreMap.off("dblclick", handleDoubleClick);
    };
  }, [libreMap, dispatch, onClickHandler, setUrlParams]);

  // ---------------------------------------------------------------------
  // Hover: show the ALKIS landparcel under the cursor in the card title
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!libreMap) {
      return;
    }

    let throttleTimeout = null;
    let lastLandparcelString;

    const handleMouseMove = (e) => {
      if (throttleTimeout) return;
      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
      }, HOVER_THROTTLE_MS);

      // The ALKIS layer is only one of several vector layers in the merged
      // style, so it is identified by the properties its features carry.
      const alkisFeature = libreMap
        .queryRenderedFeatures(e.point)
        .find((feature) => feature.properties?.gemarkungsnummer !== undefined);

      let landparcelString;
      if (alkisFeature) {
        const props = alkisFeature.properties;
        const gemarkungName =
          GEMARKUNGEN[props.gemarkungsnummer] || props.gemarkungsnummer;
        const flur = parseInt(props.flurnummer, 10);
        const zaehler = parseInt(props.zaehler, 10);
        const nenner = props.nenner ? `/${parseInt(props.nenner, 10)}` : "";
        landparcelString = `${gemarkungName} ${flur} ${zaehler}${nenner}`;
      }

      if (landparcelString !== lastLandparcelString) {
        dispatch(setHoveredLandparcel(landparcelString));
        lastLandparcelString = landparcelString;
      }
    };

    libreMap.on("mousemove", handleMouseMove);

    return () => {
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
      libreMap.off("mousemove", handleMouseMove);
    };
  }, [libreMap, dispatch]);

  // ---------------------------------------------------------------------
  // Fit the map to the current feature collection
  // ---------------------------------------------------------------------

  const oldBgRef = useRef(null);
  const oldAdditionalLayersLengthRef = useRef(null);

  useEffect(() => {
    const now = Date.now();

    if (now - lastPointSearchTimeRef.current < 1000) {
      return;
    }

    if (featureCollection) {
      dispatch(setFeatureCollection(featureCollection));
    }

    if (
      isMapLoadingValue === false &&
      featureCollection &&
      featureCollection.length !== 0 &&
      libreMap &&
      activeBackgroundLayer === oldBgRef.current &&
      oldAdditionalLayersLengthRef.current === activeAdditionalLayers.length &&
      !hasFittedBounds
    ) {
      const bb = getBoundsForFeatureArray(featureCollection);
      if (bb) {
        libreMap.fitBounds(bb, { animate: false, padding: 20 });
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
    featureCollection,
    libreMap,
    isMapLoadingValue,
    activeBackgroundLayer,
    activeAdditionalLayers,
    mode,
    hasFittedBounds,
  ]);

  // ---------------------------------------------------------------------
  // Gazetteer
  // ---------------------------------------------------------------------

  const { gazData } = useGazData();
  const { setSelection } = useSelection();

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

    if (!libreMap) {
      return;
    }
    const pos = proj4(proj4crs3857def, proj4.defs("EPSG:4326"), [
      selection.x,
      selection.y,
    ]);
    libreMap.panTo([pos[0], pos[1]], { animate: false });
    if (selection.more?.zl) {
      // the gazetteer hits carry Leaflet style (256px tile) zoom levels
      libreMap.setZoom(zoom256as512(selection.more.zl));
    }
  };

  // ---------------------------------------------------------------------
  // Print
  // ---------------------------------------------------------------------

  // Built from the layers the map currently renders, so the PDF mirrors the
  // screen: the toggles and opacities are already applied to both inputs.
  const resolvePrintLayers = useCallback(
    () => buildLagisPrintLayers(libreLayers, featureCollectionGeoJSON),
    [libreLayers, featureCollectionGeoJSON]
  );

  const [mapWidth, setMapWidth] = useState(0);
  const [mapHeight, setMapHeight] = useState(window.innerHeight * 0.5); //uggly winning

  useEffect(() => {
    if (!cardRef.current) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      setMapWidth(cardRef?.current?.offsetWidth ?? 0);
      setMapHeight(cardRef?.current?.offsetHeight ?? 0);
      libreMap?.resize();
    });

    resizeObserver.observe(cardRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [libreMap]);

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
          <PrintControl />
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
      <div
        className="lagis-libre-map"
        style={{
          width: mapWidth - 2 * padding,
          height: mapHeight - 2 * padding - headHeight,
          cursor: isMapLoadingValue ? "wait" : undefined,
        }}
      >
        <LibreContextProvider>
          <CarmaMap
            mapEngine="maplibre"
            appKey="lagis-desktop"
            embedded
            // lagis drives the background itself, everything goes into
            // libreLayers
            backgroundLayers=""
            libreLayers={libreLayers}
            setLibreMap={handleLibreMapReady}
            minZoom={9}
            maxZoom={25}
            // the app owns the hash (react-router HashRouter), so the map only
            // reads lat/lng/zoom from it and never writes back
            hashWriteEnabled={false}
            // selection, infoboxes and routing are handled by lagis itself,
            // and while a draw mode is active the clicks belong to terra-draw
            selectionEnabled={false}
            gazetteerInfoOnClick={false}
            terrainControl={false}
            compassControl={false}
            fullScreenControl={false}
            locatorControl={false}
            modalMenuControl={false}
            extraControls={
              <DrawModeControls
                // lagis measures distances and areas, not single points
                modes={["line", "polygon"]}
                active={drawMode}
                onSelect={(nextMode) =>
                  setDrawMode((previous) =>
                    previous === nextMode ? "none" : nextMode
                  )
                }
              />
            }
            gazetteerSearchComponent={
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
            }
          />
          <MeasurementsProvider>
            <MeasurementHost mode={drawMode} snapping />
          </MeasurementsProvider>
        </LibreContextProvider>
        <MapLibrePrintPreview
          map={libreMap}
          active={printActive}
          orientation={printOrientation}
          scale={printScale}
          dpi={printDpi}
          name={printName}
          resolveLayers={resolvePrintLayers}
          redrawTrigger={printRedraw}
          keepRectangle={printIfMapPrinted}
          loading={printLoading}
          onClose={() => dispatch(setPrintActive(false))}
          onLoadingChange={(loading) => dispatch(setIsLoading(loading))}
          onError={(message) => dispatch(setPrintError(message))}
          onPrintStart={() => dispatch(setIfMapPrinted(true))}
          onRequestRedraw={() => {
            dispatch(setIfMapPrinted(false));
            dispatch(setRedrawPreview(!printRedraw));
          }}
        />
        {libreMap && <LibreMapSelectionContent map={libreMap} />}
        <LibrePointSearch
          map={libreMap}
          setMode={handleSetDonutWithDelay}
          jwt={jwt}
          mode={mode}
        />
      </div>
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
