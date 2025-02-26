import L from "leaflet";
import proj4 from "proj4";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useSearchParams } from "react-router-dom";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import {
  MessageOverlay,
  replaceHashRoutedHistory,
  TopicMapSelectionContent,
  useCarmaMapContext,
  useFeatureFlags,
  useGazData,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  geoElements,
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";

import { useTweakpaneCtx } from "@carma-commons/debug";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";

import {
  OverlayTourContext,
  useOverlayHelper,
} from "@carma-commons/ui/lib-helper-overlay";
import { getApplicationVersion } from "@carma-commons/utils";

import {
  CustomViewer,
  selectShowPrimaryTileset,
  selectViewerIsMode2d,
  selectViewerModels,
  setCurrentSceneStyle,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import { SelectionItem } from "libraries/appframeworks/portals/src/lib/components/SelectionProvider.tsx";
import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import InfoBoxMeasurement from "../map-measure/InfoBoxMeasurement.jsx";
import PrintPreview from "../map-print/PrintPreview.tsx";

import versionData from "../../../version.json";

import { proj4crs3857def, proj4crs4326def } from "../../helper/gisHelper.js";
import { paramsToObject } from "../../helper/helper.ts";
import { getBackgroundLayers } from "../../helper/layer.tsx";
import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";

import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useObliqueMode } from "./GeoportalMap.hooks.ts";

import { createCismapLayers, onClickTopicMap } from "./topicmap.utils.ts";

import store from "../../store/index.ts";
import {
  getLoading,
  getSelectedFeature,
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../store/slices/features.ts";
import {
  getBackgroundLayer,
  getLayers,
  getShowHamburgerMenu,
} from "../../store/slices/mapping.ts";
import { getUIMode, UIMode, getObliqueMode } from "../../store/slices/ui.ts";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "../leaflet.css";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
}

export const GeoportalMap = ({ height, width, allow3d }: MapProps) => {
  const dispatch = useDispatch();

  const location = useLocation();
  const flags = useFeatureFlags();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const [urlParams, setUrlParams] = useSearchParams();
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isObliqueMode = useSelector(getObliqueMode);
  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;
  const models = useSelector(selectViewerModels);
  const markerAsset = models[CESIUM_CONFIG.markerKey]; //
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const showHamburgerMenu = useSelector(getShowHamburgerMenu);
  const selectedFeature = useSelector(getSelectedFeature);
  const loadingFeatureInfo = useSelector(getLoading);
  const {
    viewerRef,
    viewerAnimationMapRef,
    terrainProviderRef,
    surfaceProviderRef,
  } = useCesiumContext();
  const { getLeafletZoom } = useLeafletZoomControls();
  const showPrimaryTileset = useSelector(selectShowPrimaryTileset);
  const infoBoxOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("INFOBOX", geoElements),
    "350px",
    "137px"
  );

  const layerButtonsOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("LAYERBUTTONS", geoElements),
    "146px",
    "21px"
  );

  const mapInteractionOverlay = addCssToOverlayHelperItem(
    getCollabedHelpElementsConfig("CENTER", geoElements),
    "15px",
    "15px"
  );

  useOverlayHelper(infoBoxOverlay);
  useOverlayHelper(layerButtonsOverlay);
  useOverlayHelper(mapInteractionOverlay);

  useTweakpaneCtx(
    useMemo(
      () => ({
        folder: {
          title: "GeoportalMap",
        },
        params: {
          get renderCount() {
            return rerenderCountRef.current;
          },
          get renderInterval() {
            return lastRenderIntervalRef.current;
          },
          dpr: window.devicePixelRatio,
          resolutionScale: viewerRef.current
            ? viewerRef.current.resolutionScale
            : 0,
        },
        inputs: [
          { name: "renderCount", readonly: true, format: (v) => v.toFixed(0) },
          {
            name: "renderInterval",
            readonly: true,
            format: (v) => v.toFixed(0),
          },
          { name: "dpr", readonly: true, format: (v) => v.toFixed(1) },
          {
            name: "resolutionScale",
            readonly: true,
            format: (v) => v.toFixed(1),
          },
        ],
      }),
      [viewerRef, rerenderCountRef]
    )
  );

  const { setShowTourOverlay } = useCarmaMapContext();
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey } = useContext(OverlayTourContext);

  const [marker, setMarker] = useState(undefined);
  const [markerAccent, setMarkerAccent] = useState(undefined);
  const [pos, setPos] = useState<[number, number] | null>(null);

  const version = getApplicationVersion(versionData);

  // custom hooks

  useDispatchSachdatenInfoText();

  const { gazData } = useGazData();

  useFeatureInfoModeCursorStyle();

  const onComplete = (selection: SelectionItem) => {
    if (
      (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
      !isAreaType(selection.type as ENDPOINT) &&
      isMode2d
    ) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);
      setTimeout(() => {
        const map = routedMap.leafletMap.leafletElement;
        const updatedPos = { lat: selectedPos[1], lng: selectedPos[0] };
        const latlngPoint = L.latLng(updatedPos);

        if (map) {
          map.fireEvent("click", {
            latlng: latlngPoint,
            layerPoint: map.latLngToLayerPoint(latlngPoint),
            containerPoint: map.latLngToContainerPoint(latlngPoint),
          });
        }
      }, 300);
    }
  };

  useSelectionTopicMap({ onComplete });
  useSelectionCesium(
    !isMode2d,
    useMemo(
      () => ({
        markerAsset,
        markerAnchorHeight,
        isPrimaryStyle: showPrimaryTileset,
        surfaceProviderRef,
        terrainProviderRef,
      }),
      [
        markerAsset,
        markerAnchorHeight,
        showPrimaryTileset,
        surfaceProviderRef,
        terrainProviderRef,
      ]
    )
  );

  useEffect(() => {
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
    });
  }, [layers]);

  useEffect(() => {
    // TODO wrap this with 3d component in own component?
    // INTIALIZE Cesium Tileset style from Geoportal/TopicMap background later style
    if (viewerRef.current && backgroundLayer) {
      if (backgroundLayer.id === "luftbild") {
        dispatch(setCurrentSceneStyle("primary"));
      } else {
        dispatch(setCurrentSceneStyle("secondary"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);

  useEffect(() => {
    if (uiMode !== UIMode.FEATURE_INFO && marker !== undefined) {
      routedMap.leafletMap.leafletElement.removeLayer(marker);
      routedMap.leafletMap.leafletElement.removeLayer(markerAccent);
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      setPos(null);
      dispatch(setPreferredLayerId(""));
    }
  }, [uiMode]);

  useObliqueMode();

  useEffect(() => {
    if (isModeFeatureInfo && pos) {
      updateFeatureInfo();
    }
  }, [layers]);

  const renderInfoBox = () => {
    if (isMode2d) {
      if (isModeMeasurement) {
        return <InfoBoxMeasurement key={uiMode} />;
      }
      if (selectedFeature || loadingFeatureInfo) {
        return <FeatureInfoBox pos={pos} />;
      }
    }
    return <div></div>;
  };

  const showOverlayFromOutside = (key: string) => {
    setAppMenuVisible(false);
    setSecondaryWithKey(key);
    setShowTourOverlay(true);
  };

  const updateFeatureInfo = () => {
    setTimeout(() => {
      const map = routedMap.leafletMap.leafletElement;
      const latlngPoint = L.latLng(pos);
      map.fireEvent("click", {
        latlng: latlngPoint,
        layerPoint: map.latLngToLayerPoint(latlngPoint),
        containerPoint: map.latLngToContainerPoint(latlngPoint),
      });
    }, 150);
  };

  // TODO Move out Controls to own component

  console.debug("RENDER: [GEOPORTAL] MAP", isMode2d);
  rerenderCountRef.current++;
  lastRenderIntervalRef.current = Date.now() - lastRenderTimeStampRef.current;
  lastRenderTimeStampRef.current = Date.now();

  return (
    <>
      <div className={"map-container-2d"} style={{ zIndex: 400 }}>
        <TopicMapComponent
          gazData={gazData}
          modalMenu={
            <GenericModalApplicationMenu
              {...getCollabedHelpComponentConfig({
                versionString: version,
                showOverlayFromOutside: showOverlayFromOutside,
              })}
            />
          }
          applicationMenuTooltipString={tooltipText}
          hamburgerMenu={showHamburgerMenu}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          mapStyle={{
            width,
            height,
            touchAction: "none",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
          }}
          leafletMapProps={{ editable: true }}
          minZoom={10}
          backgroundlayers="empty"
          mappingBoundsChanged={(boundingbox) => {
            // console.debug('xxx bbox', createWMSBbox(boundingbox));
          }}
          locationChangedHandler={(location) => {
            const newParams = { ...paramsToObject(urlParams), ...location };
            setUrlParams(newParams);
            if (
              location.zoom.toString() !== urlParams.get("zoom").toString() &&
              isModeFeatureInfo
            ) {
              updateFeatureInfo();
            }
          }}
          onclick={(e) => {
            const map = routedMap.leafletMap.leafletElement;
            const baseUrl = window.location.origin + window.location.pathname;

            if (uiMode === UIMode.FEATURE_INFO) {
              if (marker !== undefined) {
                map.removeLayer(marker);
              }
              if (markerAccent !== undefined) {
                map.removeLayer(markerAccent);
              }

              map.getPane(
                "markerPaneWithBlendModeDifference"
              ).style.zIndex = 601;
              setMarkerAccent(
                L.marker([e.latlng.lat, e.latlng.lng], {
                  // pane: "backgroundlayerTooltips",
                  icon: L.divIcon({
                    className: "custom-marker", // Optional class for external styles
                    html: `
                          <div style="
                            position: relative;
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            opacity: 1;
                          ">
                            <div style="
                              position: absolute;
                              width: 20px;
                              height: 20px;
                              border: 2px solid black;
                              border-radius: 50%;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 20000px;
                              height: 1px;
                              background-color: black;
                              right: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 20000px;
                              height: 1px;
                              background-color: black;
                              left: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 1px;
                              height: 20000px;
                              background-color: black;
                              top: 18px;
                              opacity: 0.5;
                            "></div>
                            <div style="
                              position: absolute;
                              width: 1px;
                              height: 20000px;
                              background-color: black;
                              bottom: 18px;
                              opacity: 0.5;
                            "></div>
                          </div>
                        `,
                    iconSize: [30, 30],
                  }),
                }).addTo(map)
              );
              setMarker(
                L.marker([e.latlng.lat, e.latlng.lng], {
                  pane: "markerPaneWithBlendModeDifference",
                  icon: L.divIcon({
                    className: "custom-marker", // Optional class for external styles
                    html: `
                          <div style="
                            position: relative;
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                          ">
                             <div style="
                              position: absolute;
                              width: 6px;
                              height: 6px;
                              background-color: yellow;
                              border-radius: 50%;
                            ">
                          </div>
                        `,
                    iconSize: [30, 30],
                  }),
                }).addTo(map)
              );

              setPos([e.latlng.lat, e.latlng.lng]);
            }
            onClickTopicMap(e, {
              dispatch,
              mode: uiMode,
              store,
              zoom: getLeafletZoom(),
            });
          }}
          gazetteerSearchControl={false}
          infoBox={renderInfoBox()}
          zoomSnap={LEAFLET_CONFIG.zoomSnap}
          zoomDelta={LEAFLET_CONFIG.zoomDelta}
        >
          <TopicMapSelectionContent />
          {backgroundLayer &&
            backgroundLayer.visible &&
            getBackgroundLayers({
              layerString: backgroundLayer.layers,
              masterOpacity: backgroundLayer.opacity,
            })}

          {createCismapLayers(layers, {
            mode: uiMode,
            dispatch,
            zoom: getLeafletZoom(),
            selectedFeature,
          })}
          <PrintPreview />
        </TopicMapComponent>
      </div>
      {allow3d && (
        <div
          ref={container3dMapRef}
          className={"map-container-3d"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 400,
            opacity: isMode2d ? 0 : 1,
            transition: `opacity ${CESIUM_CONFIG.transitions.mapMode.duration}ms ease-in-out`,
            pointerEvents: isMode2d ? "none" : "auto",
          }}
        >
          {flags.featureFlagObliqueViewModeCesium && (
            <MessageOverlay
              message={isObliqueMode ? "⚠️ Oblique Mode Enabled ⚠️" : ""}
            />
          )}

          <CustomViewer
            containerRef={container3dMapRef}
            cameraOptions={CESIUM_CONFIG.camera}
            onSceneChange={(e) => {
              console.debug(
                "[GEOPORTALMAP|HASH|SCENE|CESIUM]cesium scene changed",
                e
              );
              replaceHashRoutedHistory(e, location.pathname);
            }}
          />
        </div>
      )}
    </>
  );
};

export default GeoportalMap;
