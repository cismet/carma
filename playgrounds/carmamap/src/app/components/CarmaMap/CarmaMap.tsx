import {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import L from "leaflet";
import {
  Cartographic,
  Math as CesiumMath,
  CesiumTerrainProvider,
  Color,
  Terrain,
} from "cesium";

import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  ControlLayoutCanvas,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FullscreenControl } from "@carma-mapping/components";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import {
  getCollabedHelpComponentConfig,
  tooltipText,
} from "@carma-collab/wuppertal/geoportal";

import {
  detectWebGLContext,
  getApplicationVersion,
  updateHashHistoryState,
} from "@carma-commons/utils";

import {
  CustomViewer,
  MapTypeSwitcher,
  Compass,
  selectShowPrimaryTileset,
  selectViewerIsMode2d,
  selectViewerModels,
  setIsMode2d,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
  setCurrentSceneStyle,
  SceneStyleToggle,
  selectViewerHome,
} from "@carma-mapping/cesium-engine";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma-commons/types";

import versionData from "../../../version.json";

import { paramsToObject } from "../../helper/helper.ts";
import { getBackgroundLayers } from "../../helper/layer.tsx";

import { useWindowSize } from "../../hooks/useWindowSize.ts";
import useLeafletZoomControls from "../../hooks/leaflet/useLeafletZoomControls.ts";

import store from "../../store/index.ts";
import {
  getBackgroundLayer,
  getLayers,
  getSelectedMapLayer,
  getShowFullscreenButton,
  setBackgroundLayer,
} from "../../store/slices/mapping.ts";
import {
  getUIAllow3d,
  getUIMode,
  setUIAllow3d,
  UIMode,
} from "../../store/slices/ui.ts";

import { onClickTopicMap } from "./topicmap.utils.ts";
import { createCismapLayers } from "./layer.utils.ts";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config.ts";
import { layerMap } from "../../config/index.ts";

import "../leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { HGKWMSTLayer } from "../HGKWMSTLayer.tsx";

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

const SIMULATION_KEY = "selectedSimulation";

enum PARAMS {
  ONLY_2D = "2donly",
  BASEMAP_STYLE = "bg",
}

enum MANAGED_BACKGROUND_LAYERS {
  TOPO = "karte",
  ORTHO = "luftbild",
}

enum BASEMAP_STYLE_KEYS {
  PRIMARY = "1",
  SECONDARY = "2",
}

enum LAYER_TYPES {
  WMTS = "wmts",
}

// playground custom HGK keys

const HGK_KEYS = Object.freeze({
  0: "HQ10-50",
  1: "HQ100",
  2: "HQ500",
});

const HGK_TERRAIN_PROVIDER_URLS = {
  "HQ10-50": "https://cesium-wupp-terrain.cismet.de/HQ10-50/",
  HQ100: "https://cesium-wupp-terrain.cismet.de/HQ100/",
  HQ500: "https://cesium-wupp-terrain.cismet.de/HQ500cm/",
};

// reuse terrain provider instances
const hgkTerrainProviders = {};

type CarmaMapProps = {
  children?: ReactNode;
  showBaseMapStyleToggle?: boolean;
};

export const CarmaMap = ({
  children,
  showBaseMapStyleToggle = false,
}: CarmaMapProps) => {
  const dispatch = useDispatch();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // url param handling
  const [urlParams, setUrlParams] = useSearchParams();
  const [hqKey, setHqKey] = useState<undefined | "HQ10" | "HQ100" | "HQ500">(
    "HQ500"
  );

  const topicMapLocationChangedHandler = (location: Location) => {
    (location) => {
      const newParams = { ...paramsToObject(urlParams), ...location };
      setUrlParams(newParams);
    };
  };

  const is2dOnlyParamSet = urlParams.get(PARAMS.ONLY_2D) !== null;
  const baseMapStyle = urlParams.get(PARAMS.BASEMAP_STYLE);

  // State and Selectors
  const allow3d = useSelector(getUIAllow3d);

  const isMode2d = useSelector(selectViewerIsMode2d);

  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);

  const models = useSelector(selectViewerModels);
  const markerAsset = models[CESIUM_CONFIG.markerKey]; //
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const {
    viewerRef,
    viewerAnimationMapRef,
    terrainProviderRef,
    surfaceProviderRef,
    tilesetsRefs,
  } = useCesiumContext();

  const homeControl = useHomeControl();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(viewerRef, viewerAnimationMapRef);
  const { getLeafletZoom, zoomInLeaflet, zoomOutLeaflet } =
    useLeafletZoomControls();
  const showPrimaryTileset = useSelector(selectShowPrimaryTileset);

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const [marker, setMarker] = useState(undefined);

  const version = getApplicationVersion(versionData);

  // custom hooks

  const { gazData } = useGazData();
  const { width, height } = useWindowSize(wrapperRef);

  const { setSelection } = useSelection();

  useSelectionTopicMap();
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

  const onGazetteerSelection = (selection: SearchResultItem) => {
    if (!selection) {
      console.debug("onGazetteerSelection", selection);
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  useEffect(() => {
    if (viewerRef.current && backgroundLayer) {
      if (backgroundLayer.id === MANAGED_BACKGROUND_LAYERS.ORTHO) {
        dispatch(setCurrentSceneStyle("primary"));
      } else {
        dispatch(setCurrentSceneStyle("secondary"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);

  useEffect(() => {
    if (is2dOnlyParamSet || !hasGPU) {
      console.debug(
        "disabling 3d mode, because of url param or gpu",
        is2dOnlyParamSet,
        !hasGPU
      );
      dispatch(setUIAllow3d(false));
    }
  }, [is2dOnlyParamSet, dispatch]);

  useEffect(() => {
    // set 2d mode if allow3d is false or undefined
    if (!isMode2d && (allow3d === false || allow3d === undefined)) {
      console.debug("seting mode to 2d, because of allow3d", allow3d);
      dispatch(setIsMode2d(true));
    }
  }, [isMode2d, allow3d, dispatch]);

  console.debug("RENDER: [CARMAMAP] MAP", isMode2d);

  const homePosition = useSelector(selectViewerHome);

  const topicMapHomeClick = () => {
    if (homePosition && routedMap?.leafletMap?.leafletElement) {
      const { latitude, longitude } = Cartographic.fromCartesian(homePosition);
      const center = [
        CesiumMath.toDegrees(latitude),
        CesiumMath.toDegrees(longitude),
      ];
      console.debug("topicMapHomeClick", center, homePosition);
      routedMap.leafletMap.leafletElement.flyTo(center, 17);
    }
  };

  const onHomeClick = () => {
    homeControl();
    topicMapHomeClick();
  };

  const toggleTopicMapBackgroundLayer = useCallback(
    (isToPrimary: boolean) => {
      if (isToPrimary) {
        dispatch(
          setBackgroundLayer({
            ...selectedMapLayer,
            id: MANAGED_BACKGROUND_LAYERS.TOPO,
            visible: true,
          })
        );
      } else {
        const id = MANAGED_BACKGROUND_LAYERS.ORTHO;
        const layer = layerMap[id];
        dispatch(
          setBackgroundLayer({
            id,
            title: layer.title,
            opacity: 1.0,
            description: layer.description,
            inhalt: layer.inhalt,
            eignung: layer.eignung,
            layerType: LAYER_TYPES.WMTS,
            visible: true,
            props: {
              name: "",
              url: layer.url,
            },
            layers: layer.layers,
          })
        );
      }
    },
    [dispatch, selectedMapLayer]
  );

  useEffect(() => {
    if (baseMapStyle === BASEMAP_STYLE_KEYS.PRIMARY) {
      toggleTopicMapBackgroundLayer(true);
      dispatch(setCurrentSceneStyle("primary"));
    } else if (baseMapStyle === BASEMAP_STYLE_KEYS.SECONDARY) {
      toggleTopicMapBackgroundLayer(false);
      //dispatch(setCurrentSceneStyle("secondary"));
      // disable secondary style for HGK
      dispatch(setCurrentSceneStyle("primary"));
    }
  }, [baseMapStyle, dispatch, toggleTopicMapBackgroundLayer]);

  // CUSTOM CODE for simulation
  useEffect(() => {
    if (urlParams.get(SIMULATION_KEY)) {
      const selectedSimulation = parseInt(urlParams.get(SIMULATION_KEY));
      const key = HGK_KEYS[selectedSimulation];
      if (key !== undefined) {
        console.debug(
          "selectedSimulation HGK",
          selectedSimulation,
          key,
          HGK_KEYS
        );
        setHqKey(key);
      }
    }
  }, [urlParams]);

  useEffect(() => {
    if (hqKey) {
      (async () => {
        if (!hgkTerrainProviders[hqKey]) {
          const url = HGK_TERRAIN_PROVIDER_URLS[hqKey];
          try {
            hgkTerrainProviders[hqKey] = await CesiumTerrainProvider.fromUrl(
              url
            );
          } catch (e) {
            console.error(
              "failed to create terrain provider for",
              hqKey,
              url,
              e
            );
          }
        }
        const provider = hgkTerrainProviders[hqKey];
        terrainProviderRef.current = provider;
        if (viewerRef.current && provider) {
          setTimeout(() => {
            // overwrite default terrain provider
            console.debug("set HGK terrain provider for", hqKey, provider);
            const viewer = viewerRef.current;
            viewer.scene.terrainProvider = provider;
            viewer.scene.requestRender();
          }, 500);
        }
      })();
    }
  }, [hqKey, terrainProviderRef, viewerRef]);

  useEffect(() => {
    if (!isMode2d && viewerRef.current) {
      setTimeout(() => {
        const viewer = viewerRef.current;
        setCurrentSceneStyle("primary");
        console.debug("force hide default imagery layer hgk");
        viewer.scene.backgroundColor = Color.DIMGREY;
        viewer.scene.globe.baseColor = new Color(0.3, 0.2, 0.8, 0.7);
        viewer.scene.globe.show = true;
        viewer.scene.globe.translucency.enabled = true;
        viewer.scene.globe.translucency.frontFaceAlpha = 1.0;
        viewer.scene.globe.translucency.backFaceAlpha = 1.0;
        if (viewer.imageryLayers.length > 0) {
          console.debug("hide default imagery layer hgk");
          const imageryLayer = viewer.imageryLayers.get(0);
          imageryLayer.show = false;
        }
        viewer.scene.requestRender();
      }, 300);
    }
  }, [isMode2d, viewerRef, tilesetsRefs]);

  console.debug("CARMAMAP render hgk", hqKey);

  return (
    <ControlLayout>
      <Control position="topleft" order={10}>
        <div className="flex flex-col">
          <ControlButtonStyler
            onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
            dataTestId="zoom-in-control"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
            className="!rounded-t-none !border-t-[1px]"
            dataTestId="zoom-out-control"
          >
            <FontAwesomeIcon icon={faMinus} className="text-base" />
          </ControlButtonStyler>
        </div>
      </Control>
      <Control position="topleft" order={20}>
        {showFullscreenButton && <FullscreenControl />}
      </Control>
      <Control position="topleft" order={40}>
        <ControlButtonStyler onClick={onHomeClick} dataTestId="home-control">
          <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
        </ControlButtonStyler>
        {showBaseMapStyleToggle && (
          <SceneStyleToggle onToggle={toggleTopicMapBackgroundLayer} />
        )}
      </Control>
      {allow3d && (
        <Control position="topleft" order={70}>
          <MapTypeSwitcher
            duration={CESIUM_CONFIG.transitions.mapMode.duration}
          />
          <Compass disabled={isMode2d} />
        </Control>
      )}
      <Control position="bottomleft" order={10}>
        <div className="h-full w-full">
          <LibFuzzySearch
            gazData={gazData}
            //referenceSystem={referenceSystem}
            //referenceSystemDefinition={referenceSystemDefinition}
            onSelection={onGazetteerSelection}
            placeholder="Wohin?"
          />
        </div>
      </Control>
      <ControlLayoutCanvas ref={wrapperRef}>
        <>
          <div className={"map-container-2d"} style={{ zIndex: 400 }}>
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
              hamburgerMenu={false}
              locatorControl={false}
              fullScreenControl={false}
              zoomControls={false}
              mapStyle={{ width, height }}
              leafletMapProps={{ editable: true }}
              minZoom={10}
              backgroundlayers="empty"
              mappingBoundsChanged={(boundingbox) => {
                // console.debug('xxx bbox', createWMSBbox(boundingbox));
              }}
              locationChangedHandler={topicMapLocationChangedHandler}
              onclick={(e) => {
                const map = routedMap.leafletMap.leafletElement;
                const baseUrl =
                  window.location.origin + window.location.pathname;
                if (uiMode === UIMode.FEATURE_INFO) {
                  if (marker !== undefined) {
                    map.removeLayer(marker);
                  }
                  setMarker(
                    L.marker([e.latlng.lat, e.latlng.lng], {
                      icon: L.icon({
                        iconUrl: baseUrl + "crosshair.svg",
                        iconSize: [30, 30],
                      }),
                    }).addTo(map)
                  );
                }
                onClickTopicMap(e, {
                  dispatch,
                  mode: uiMode,
                  store,
                  zoom: getLeafletZoom(),
                });
              }}
              gazetteerSearchComponent={<></>}
              zoomSnap={LEAFLET_CONFIG.zoomSnap}
              zoomDelta={LEAFLET_CONFIG.zoomDelta}
            >
              <TopicMapSelectionContent />
              {children}
              {backgroundLayer &&
                backgroundLayer.visible &&
                getBackgroundLayers({ layerString: backgroundLayer.layers })}

              {createCismapLayers(layers, {
                mode: uiMode,
                dispatch,
                zoom: getLeafletZoom(),
              })}
              {hqKey && <HGKWMSTLayer hqKey={hqKey} />}
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
              <CustomViewer
                containerRef={container3dMapRef}
                cameraLimiterOptions={CESIUM_CONFIG.camera}
                onSceneChange={(e) => {
                  console.debug(
                    "[GEOPORTALMAP|HASH|SCENE|CESIUM]cesium scene changed",
                    e
                  );
                  updateHashHistoryState(e.hashParams, "/", {
                    removeKeys: ["zoom"],
                    label: "app/carma:3D",
                  });
                }}
              ></CustomViewer>
            </div>
          )}
        </>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export default CarmaMap;
