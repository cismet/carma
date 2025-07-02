import L from "leaflet";
import proj4 from "proj4";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import {
  TopicMapSelectionContent,
  useAuth,
  useFeatureFlags,
  useGazData,
  useHashState,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  geoElements,
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig as getCollabedHelpElementsConfig } from "@carma-collab/wuppertal/helper-overlay";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";

import {
  useOverlayHelper,
  useOverlayTourContext,
} from "@carma-commons/ui/lib-helper-overlay";
import { getApplicationVersion } from "@carma-commons/utils";

import {
  cesiumClearParamKeys,
  CustomViewer,
  selectShowPrimaryTileset,
  selectViewerIsMode2d,
  selectViewerModels,
  setCurrentSceneStyle,
  useCesiumContext,
  useCesiumInitialCameraFromSearchParams,
} from "@carma-mapping/cesium-engine";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";

import { SelectionItem } from "libraries/appframeworks/portals/src/lib/components/SelectionProvider.tsx";
import FeatureInfoBox from "../feature-info/FeatureInfoBox.tsx";
import InfoBoxMeasurement from "../map-measure/InfoBoxMeasurement.jsx";
import PrintPreview from "../map-print/PrintPreview.tsx";

import versionData from "../../../version.json";

import { proj4crs3857def, proj4crs4326def } from "../../helper/gisHelper.js";
import { getBackgroundLayers } from "../../helper/layer.tsx";
import { addCssToOverlayHelperItem } from "../../helper/overlayHelper.ts";

import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";
import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useObliqueInitializer } from "../../oblique/hooks/useObliqueInitializer.ts";

import { createCismapLayers, onClickTopicMap } from "./topicmap.utils.ts";
import { useTweakpane } from "./GeoportalMap.useTweakpane.ts";

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
  getLayersIdle,
  getShowHamburgerMenu,
  setLayersIdle,
} from "../../store/slices/mapping.ts";
import { getUIMode, UIMode } from "../../store/slices/ui.ts";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "../leaflet.css";
import LoginForm from "../LoginForm.tsx";
import { Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightFromBracket,
  faKey,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
}

export const GeoportalMap = ({ height, width, allow3d }: MapProps) => {
  const dispatch = useDispatch();

  // Contexts
  const { viewerRef, terrainProviderRef, surfaceProviderRef } =
    useCesiumContext();
  const { updateHash } = useHashState();

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const backgroundLayer = useSelector(getBackgroundLayer);
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
  const { jwt, setJWT } = useAuth();

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

  useTweakpane(viewerRef, rerenderCountRef, lastRenderIntervalRef);

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  const { setSecondaryWithKey, showOverlayHandler } = useOverlayTourContext();

  const [isLoginFormVisible, setIsLoginFormVisible] = useState(false);
  const [marker, setMarker] = useState(undefined);
  const [markerAccent, setMarkerAccent] = useState(undefined);
  const [pos, setPos] = useState<[number, number] | null>(null);
  // TODO: move all these to a custom hook and collect all calls to updateFeatureInfo there
  const [shouldUpdateFeatureInfo, setShouldUpdateFeatureInfo] =
    useState<boolean>(false);

  const version = getApplicationVersion(versionData);

  // custom hooks
  const flags = useFeatureFlags();
  const { isDebugMode } = flags;
  const cesiumInitialCameraView = useCesiumInitialCameraFromSearchParams();
  const { isObliqueMode } = useObliqueInitializer(isDebugMode);

  useDispatchSachdatenInfoText();

  const { gazData } = useGazData();

  useFeatureInfoModeCursorStyle();

  const onComplete = (selection: SelectionItem) => {
    if (layers.filter((l) => l.layerType === "vector").length === 0) return;
    const layersIdle = getLayersIdle(store.getState());
    if (
      (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
      !isAreaType(selection.type as ENDPOINT) &&
      isMode2d
    ) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);
      if (layersIdle) {
        const map = routedMap?.leafletMap?.leafletElement;
        const updatedPos = { lat: selectedPos[1], lng: selectedPos[0] };
        const latlngPoint = L.latLng(updatedPos);

        if (map) {
          map.fireEvent("click", {
            latlng: latlngPoint,
            layerPoint: map.latLngToLayerPoint(latlngPoint),
            containerPoint: map.latLngToContainerPoint(latlngPoint),
          });
        }
      } else {
        setTimeout(() => {
          onComplete(selection);
        }, 20);
      }
    }
  };

  const updateFeatureInfoLeaflet = () => {
    const map = routedMap?.leafletMap?.leafletElement;

    setShouldUpdateFeatureInfo(false);
    setTimeout(() => {
      const latlngPoint = L.latLng(pos);
      map &&
        map.fireEvent("click", {
          latlng: latlngPoint,
          layerPoint: map.latLngToLayerPoint(latlngPoint),
          containerPoint: map.latLngToContainerPoint(latlngPoint),
        });
    }, 150);
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
    ),
    isObliqueMode
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
    const map = routedMap?.leafletMap?.leafletElement;
    if (uiMode !== UIMode.FEATURE_INFO && marker !== undefined && map) {
      map.removeLayer(marker);
      map.removeLayer(markerAccent);
      dispatch(setSelectedFeature(null));
      dispatch(setSecondaryInfoBoxElements([]));
      dispatch(setFeatures([]));
      setPos(null);
      dispatch(setPreferredLayerId(""));
    }
  }, [uiMode]);

  useEffect(() => {
    if (isModeFeatureInfo && pos) updateFeatureInfoLeaflet();
  }, [layers]);

  useEffect(() => {
    const map = routedMap?.leafletMap?.leafletElement;

    const handleZoomEnd = () => {
      setShouldUpdateFeatureInfo(true);
    };

    map && map.on("zoomend", handleZoomEnd);

    // Clean up the event listener when the component unmounts
    return () => {
      map && map.off("zoomend", handleZoomEnd);
    };
  }, [routedMap]);

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
    showOverlayHandler();
  };

  useEffect(() => {
    if (shouldUpdateFeatureInfo) updateFeatureInfoLeaflet();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldUpdateFeatureInfo]);

  const topicMapLocationChangedHandler = ({
    lat,
    lng,
    zoom,
  }: {
    lat: number;
    lng: number;
    zoom: number;
  }) => {
    if (!isMode2d) {
      console.debug(
        "[TopicMap|DEBUG] Location changed handler triggered while in 3D mode"
      );
      return;
    }
    updateHash(
      { lat, lng, zoom },
      {
        clearKeys: cesiumClearParamKeys,
        label: "GPM:TopicMap:locationChangedHandler",
      }
    );
    dispatch(setLayersIdle(false));
  };

  const onSceneChange = (e: { hashParams: Record<string, string> }) => {
    if (isMode2d) {
      console.debug(
        "[CESIUM|DEBUG|CESIUM_WARN] Cesium scene change triggered while in 2D mode"
      );
      return;
    }
    updateHash(e.hashParams, { clearKeys: ["zoom"], label: "GPM:3D" });
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
                showOverlayFromOutside,
                loginFormToggle: () =>
                  setIsLoginFormVisible(!isLoginFormVisible),
                isLoginFormVisible,
                loginForm: (
                  <LoginForm
                    onSuccess={() => {
                      setIsLoginFormVisible(false);
                      setAppMenuVisible(false);
                    }}
                    closeLoginForm={() => setIsLoginFormVisible(false)}
                  />
                ),
                loginFormTrigger: (
                  <Button
                    type="text"
                    onClick={() =>
                      jwt
                        ? setJWT(null)
                        : setIsLoginFormVisible(!isLoginFormVisible)
                    }
                  >
                    <FontAwesomeIcon
                      icon={jwt ? faArrowRightFromBracket : faKey}
                      size="lg"
                    />
                  </Button>
                ),
              })}
            />
          }
          gazetteerSearchComponent={EmptySearchComponent}
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
          locationChangedHandler={topicMapLocationChangedHandler}
          outerLocationChangedHandlerExclusive={true}
          onclick={(e) => {
            const map = routedMap?.leafletMap?.leafletElement;
            if (!map) return;

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
              map: map,
            });
          }}
          gazetteerSearchControl={true}
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
            leafletMap: routedMap?.leafletMap?.leafletElement,
          })}
          <PrintPreview />
        </TopicMapComponent>
      </div>
      {allow3d && cesiumInitialCameraView !== null && (
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
          <CustomViewer
            containerRef={container3dMapRef}
            cameraLimiterOptions={CESIUM_CONFIG.camera}
            initialCameraView={cesiumInitialCameraView}
            onSceneChange={onSceneChange}
          />
        </div>
      )}
    </>
  );
};

export default GeoportalMap;
