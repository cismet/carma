import {
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
// Removed Redux imports - using library pattern instead
import { useSearchParams } from "react-router-dom";
import L from "leaflet";
import {
  Cartographic,
  Math as CesiumMath,
  CesiumTerrainProvider,
  Color,
} from "cesium";

import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  ControlLayoutCanvas,
} from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FullscreenControl } from "@carma-mapping/components";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useSelection,
  useSelectionTopicMap,
  useHashState,
  useMapHashRoutingCesium,
  usePortalMapStyle,
} from "@carma-appframeworks/portals";

import { isAreaType } from "@carma/resources";

import { getApplicationVersion } from "@carma-commons/utils";

import { MapTypeSwitcher } from "@carma-mapping/components";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma/types";

import versionData from "../../../version.json";
import { getBackgroundLayers } from "../../helper/layer.tsx";

import { useLeafletZoomControls } from "@carma-mapping/engines/leaflet";
import {
  useCesiumContext,
  // TODO: Refactor removed - useCesiumInitialCameraFromSearchParams not exported
  // useCesiumInitialCameraFromSearchParams,
  CesiumSceneComponent,
  CtxEvent,
} from "@carma-mapping/engines/cesium/core";
import type { Camera } from "@carma/cesium";

// TODO: Import useWindowSize from shared library when available
// import { useWindowSize } from "../../hooks/useWindowSize.ts";

// TODO: Import placeholder components from shared library when available
// import { SceneStyleToggle, Compass, CustomWidget } from "./components";

// TODO: Remove Redux store imports - using library pattern
// import {
//   getBackgroundLayer,
//   getLayers,
//   getSelectedMapLayer,
//   getShowFullscreenButton,
//   setBackgroundLayer,
// } from "../../store/slices/mapping.ts";
// import {
//   getUIAllow3d,
//   getUIMode,
//   setUIAllow3d,
//   UIMode,
// } from "../../store/slices/ui.ts";

// Placeholder implementations for Redux selectors and actions
const getUIAllow3d = () => hasGPU;
const getUIMode = () => UIMode.DEFAULT;
const getBackgroundLayer = () => null;
const getLayers = () => [];
const getSelectedMapLayer = () => null;
const getShowFullscreenButton = () => true;
const setBackgroundLayer = () => {};
const setUIAllow3d = () => {};

enum UIMode {
  DEFAULT = "default",
  FEATURE_INFO = "featureInfo",
  MEASUREMENT = "measurement",
}

// TODO: Import from shared library when available
// import { onClickTopicMap } from "./topicmap.utils.ts";
// import { createCismapLayers } from "./layer.utils.ts";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config.ts";
import { layerMap } from "../../config/index.ts";

import "../leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

// TODO: Import from shared library when available
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/geoportal";

// TODO: Use shared 3D capabilities check hook when available
// detect GPU support, disables 3d mode if not supported
let hasGPU = true; // Default to true for now

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

type CarmaMapProps = {
  children?: ReactNode;
  showBaseMapStyleToggle?: boolean;
};

export const CarmaMap = ({
  children,
  showBaseMapStyleToggle = false,
}: CarmaMapProps) => {
  // Removed Redux dispatch - using library pattern instead
  // const dispatch = useDispatch();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const container3dMapRef = useRef<HTMLDivElement>(null);

  // url param handling
  const [urlParams, setUrlParams] = useSearchParams();

  const topicMapLocationChangedHandler = (loc: {
    lat: number;
    lng: number;
    zoom: number;
  }) => {
    const params = new URLSearchParams(urlParams);
    params.set("lat", String(loc.lat));
    params.set("lng", String(loc.lng));
    params.set("zoom", String(loc.zoom));
    setUrlParams(params, { replace: false });
  };

  const is2dOnlyParamSet = urlParams.get(PARAMS.ONLY_2D) !== null;
  const baseMapStyle = urlParams.get(PARAMS.BASEMAP_STYLE);

  // State and Selectors - using placeholder implementations
  const allow3d = getUIAllow3d();

  const backgroundLayer = getBackgroundLayer();
  const selectedMapLayer = getSelectedMapLayer();

  const ctx = useCesiumContext();
  const { isSuspendedRef } = ctx;
  const containerStyleRef = useRef<HTMLDivElement>(null);

  // Sync suspension state with cesium context
  useEffect(() => {
    if (!allow3d) {
      isSuspendedRef.current = true;
    } else {
      isSuspendedRef.current = false;
    }
  }, [allow3d, isSuspendedRef]);

  // Update DOM visibility based on suspension state
  useEffect(() => {
    const updateVisibility = () => {
      if (containerStyleRef.current) {
        containerStyleRef.current.style.opacity = isSuspendedRef.current ? "0" : "1";
        containerStyleRef.current.style.pointerEvents = isSuspendedRef.current
          ? "none"
          : "auto";
      }
    };

    // Initial update
    updateVisibility();

    // Set up interval to check for changes (since refs don't trigger re-renders)
    const interval = setInterval(updateVisibility, 100);

    return () => clearInterval(interval);
  }, [isSuspendedRef]);

  // Sync Cesium scene style based on map style changes from Portal context
  const { current: currentMapStyle, mapStyleToCesiumStyleMapping } = usePortalMapStyle();
  const cesiumContext = useCesiumContext();
  
  useEffect(() => {
    if (!allow3d || !cesiumContext.sceneStyleApplierRef.current) return;
    
    const cesiumStyle = mapStyleToCesiumStyleMapping[currentMapStyle];
    if (cesiumStyle) {
      console.log(`[CarmaMap] Syncing Cesium scene style: ${currentMapStyle} -> ${cesiumStyle}`);
      cesiumContext.sceneStyleApplierRef.current(cesiumStyle);
    }
  }, [currentMapStyle, mapStyleToCesiumStyleMapping, allow3d, cesiumContext.sceneStyleApplierRef]);

  // One-time initialization - these hooks are called once at mount
  // TODO: Refactor removed - useCesiumInitialCameraFromSearchParams not exported
  // const cesiumInitialCameraView = useCesiumInitialCameraFromSearchParams();
  const cesiumInitialCameraView = null;

  // TODO: MARKER/SELECTION MANAGEMENT (following GeoportalMap pattern)
  // - markerAsset loading from CesiumContext modelsRef
  // - Current markerAsset is undefined until models are loaded
  // - Re-enable when marker models are properly configured
  // const markerConfig = {
  //   markerAsset: undefined,
  //   markerAnchorHeight: CESIUM_CONFIG.markerAnchorHeight ?? 10,
  //   isPrimaryStyle: true,
  // };
  // useSelectionCesium(allow3d ?? false, markerConfig, false);

  const layers = getLayers();
  const uiMode = getUIMode();
  const showFullscreenButton = getShowFullscreenButton();

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  // TODO: Import from shared library when available
  const homeControl = () => {}; // useHomeControl();
  // TODO: Import from shared library when available
  const handleZoomInCesium = () => {}; // useZoomControls().handleZoomIn
  const handleZoomOutCesium = () => {}; // useZoomControls().handleZoomOut

  const { getLeafletZoom, zoomInLeaflet, zoomOutLeaflet } =
    useLeafletZoomControls({ current: routedMap?.leafletMap?.leafletElement });

  const [marker, setMarker] = useState(undefined);

  const version = getApplicationVersion(versionData);

  const { gazData } = useGazData();
  // TODO: Import useWindowSize from shared library when available
  const width = wrapperRef.current?.clientWidth ?? 0;
  const height = wrapperRef.current?.clientHeight ?? 0;

  const { setSelection } = useSelection();
  const { updateHash } = useHashState();

  // Use library hooks for overlays and routing (GeoportalMap pattern)
  // TODO: Re-enable when useGeoportalOverlays is exported from portals
  // useGeoportalOverlays();
  useSelectionTopicMap();

  // Initialize Cesium camera change handler for hash routing (GeoportalMap pattern)
  const hashRoutingHandler = useMapHashRoutingCesium();
  const onCameraChanged = useCallback(
    (params: { source: string; camera: Camera }) => {
      // Adapt to the hash routing handler signature
      hashRoutingHandler({
        ...params,
        hashParams: {}, // TODO: Extract hash params from stringifiedCamera
      } as any);
    },
    [hashRoutingHandler]
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
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  // TODO use shared 3d capabilities check hook to enable cesium mode

  // TODO add transition handling with transition provider between 2d and 3d

  // TODO replace with libarified version of TopicMapComponentWrapper from GeoportalMap
  // TODO replace with libarified version of CesiumMapComponentWrapper from GeoportalMap

  // TODO: Link up with MapStyleProvider event bus
  const toggleTopicMapBackgroundLayer = useCallback((isToPrimary: boolean) => {
    console.debug("toggleTopicMapBackgroundLayer", isToPrimary);
    // TODO: Replace Redux dispatch usage with library pattern
  }, []);

  const isMode2d = isSuspendedRef.current;
  console.debug("RENDER: [CARMAMAP] MAP", isMode2d);

  // TODO make this shared use location hook for topicmap
  const topicMapHomeClick = () => {
    // TODO: Get home position from CesiumContext when available
    console.debug("topicMapHomeClick - TODO: implement home position");
  };

  const onHomeClick = () => {
    homeControl();
    topicMapHomeClick();
  };

  console.debug("CARMAMAP render");

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
        {/* TODO: Re-enable when SceneStyleToggle is available */}
        {/* {showBaseMapStyleToggle && (
          <SceneStyleToggle onToggle={toggleTopicMapBackgroundLayer} />
        )} */}
      </Control>
      {allow3d && (
        <Control position="topleft" order={70}>
          <MapTypeSwitcher
            duration={CESIUM_CONFIG.transitions.mapMode.duration}
          />
          {/* TODO: Re-enable when Compass is available */}
          {/* <Compass disabled={isMode2d} /> */}
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
              applicationMenuTooltipString={"tooltipText"}
              hamburgerMenu={false}
              locatorControl={false}
              fullScreenControl={false}
              zoomControls={false}
              mapStyle={{ width, height }}
              leafletMapProps={{ editable: true }}
              minZoom={10}
              backgroundlayers="empty"
              mappingBoundsChanged={() => {
                // console.debug('xxx bbox', createWMSBbox(boundingbox));
              }}
              locationChangedHandler={topicMapLocationChangedHandler}
              outerLocationChangedHandlerExclusive={true}
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
                console.debug("Map clicked", e.latlng);
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

              {/* TODO: Re-enable when createCismapLayers is available */}
              {/* {createCismapLayers(layers, {
                mode: uiMode,
                zoom: getLeafletZoom(),
              })} */}
              {/* TODO: Remove HGK component - obsolete */}
              {/* {hqKey && <HGKWMSTLayer hqKey={hqKey} />} */}
            </TopicMapComponent>
          </div>
          {allow3d && cesiumInitialCameraView && (
            <div
              ref={(node) => {
                container3dMapRef.current = node;
                containerStyleRef.current = node;
              }}
              className={"map-container-3d"}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 400,
                opacity: isSuspendedRef.current ? 0 : 1,
                transition: `opacity ${CESIUM_CONFIG.transitions.mapMode.duration}ms ease-in-out`,
                pointerEvents: isSuspendedRef.current ? "none" : "auto",
              }}
            >
              {/* TODO: Refactor removed - CesiumSceneComponent props changed */}
              {cesiumInitialCameraView && (
                <CesiumSceneComponent
                  containerRef={container3dMapRef}
                  onCameraChanged={onCameraChanged}
                />
              )}
            </div>
          )}
        </>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export default CarmaMap;
