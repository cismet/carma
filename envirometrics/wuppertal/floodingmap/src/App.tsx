import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import EnviroMetricMap from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap";
import { version as cismapEnvirometricsVersion } from "@cismet-dev/react-cismap-envirometrics-maps/meta";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import CrossTabCommunicationControl from "react-cismap/CrossTabCommunicationControl";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  SelectionMetaData,
  TopicMapSelectionContent,
  useGazData,
  useHashLaunchMode,
  useSelection,
  useSelectionCesium,
  useSelectionTopicMap,
} from "@carma-appframeworks/portals";
import { ENDPOINT, isAreaTypeWithGEP } from "@carma-commons/resources";
import { getApplicationVersion, HASH_LAUNCH_MODE } from "@carma-commons/utils";
import { Cartesian3 } from "@carma/cesium";

// TODO fix collab path names
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";

import {
  CustomViewer,
  PitchingCompass,
  selectViewerModels,
  useCesiumContext,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/engines/cesium";
import type { SceneLike } from "@carma-mapping/engines/cesium/api";
import {
  createViewStateShareableHashCodec,
  flyViewStateInCesium,
  HASH_ZOOM_CONVENTION,
  ViewStateNavigationManagerProvider,
  ViewStateProvider,
  useCesiumNavigationBridge,
} from "@carma-mapping/engines-interop/view-state";
import {
  EmptySearchComponent,
  LibFuzzySearch,
} from "@carma-mapping/fuzzy-search";
import { type SearchResultItem } from "@carma/types";

import FloodingTopicMapContainer from "./components/FloodingTopicMapContainer";
import {
  FullscreenControl,
  MapFrameworkSwitcher,
  RoutedMapLocateControl,
  useMapFrameworkSwitcherContext,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

import { StateAwareChildren } from "./components/StateAwareChildren";

import versionData from "./version.json";

import useLeafletZoomControls from "./hooks/useLeafletZoomControls";
import { useFloodingmapInitialView } from "./hooks/useFloodingmapInitialView";

import config from "./config";
import { EMAIL } from "./config/app.config";
import {
  CESIUM_CONFIG,
  CONSTRUCTOR_OPTIONS,
} from "./config/cesium/cesium.config";
import { DEFAULT_HOME_VIEW_REF } from "./config/view.config";
import { DEFAULT_HOME_VIEW_STATE } from "./utils/floodingmapHomeViewState";

import "cesium/Build/Cesium/Widgets/widgets.css";

const DEFAULT_HASH_FOV_DEG = 45;
const FLOODINGMAP_CESIUM_VIEW_ADAPTER_ID = "floodingmap-cesium";

function FloodingmapAppContent({ sync = false }: { sync?: boolean }) {
  const version = getApplicationVersion(versionData);
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap - 2;

  const { gazData } = useGazData();

  // Resolve launch mode from hash, set framework, clean up flags
  useHashLaunchMode({ defaultMode: HASH_LAUNCH_MODE.THREE_D });

  const reactCismapEnvirometricsVersion = cismapEnvirometricsVersion;
  const [hochwasserschutz, setHochwasserschutz] = useState(true);
  const {
    initialEnviroMetricState,
    initialCameraView,
    isInitialCameraResolved,
  } = useFloodingmapInitialView();
  const homeValidationCenter = useMemo(
    () =>
      Cartesian3.fromDegrees(
        DEFAULT_HOME_VIEW_REF.lng,
        DEFAULT_HOME_VIEW_REF.lat,
        DEFAULT_HOME_VIEW_REF.altitude
      ),
    []
  );
  const ctx = useCesiumContext();
  const {
    getScene,
    getTerrainProvider,
    getSurfaceProvider,
    isViewerReady,
    initialViewApplied,
  } = ctx;
  const cesiumScene = getScene();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(ctx, {
    fovMode: false,
  });
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  // LEAFLET related
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  // CESIUM related
  const container3dMapRef = useRef<HTMLDivElement>(null);
  const [cesiumContainerElement, setCesiumContainerElement] =
    useState<HTMLDivElement | null>(null);
  const [shouldMountCesium, setShouldMountCesium] = useState(false);
  const cesiumReadyPromiseRef = useRef<Promise<void> | null>(null);
  const cesiumReadyResolversRef = useRef<Array<() => void>>([]);

  const handleCesiumContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      container3dMapRef.current = node;
      setCesiumContainerElement(node);
    },
    []
  );

  // Register map frameworks with switcher
  const leafletMap = routedMap?.leafletMap?.leafletElement ?? null;
  const isCesiumRuntimeReady = Boolean(
    cesiumScene && cesiumContainerElement && isViewerReady
  );

  const getLeafletMap = useCallback(
    () => routedMap?.leafletMap?.leafletElement ?? null,
    [routedMap]
  );
  const getCesiumContainer = useCallback(
    () => container3dMapRef.current,
    [container3dMapRef]
  );
  const getCesiumTerrainProviders = useCallback(
    () => ({
      TERRAIN: getTerrainProvider() ?? null,
      SURFACE: getSurfaceProvider() ?? null,
    }),
    [getSurfaceProvider, getTerrainProvider]
  );

  useRegisterMapFramework({
    getLeafletMap,
    getCesiumScene: () => cesiumScene,
    getCesiumContainer,
    getCesiumTerrainProviders,
  });

  const homeCenter = useMemo(
    () =>
      [DEFAULT_HOME_VIEW_REF.lat, DEFAULT_HOME_VIEW_REF.lng] as [
        number,
        number
      ],
    []
  );
  const homeLeafletZoom = DEFAULT_HOME_VIEW_REF.zoom ?? 18;

  const { isCesium, isLeaflet, getIsCesium, registerCallbacks } =
    useMapFrameworkSwitcherContext();

  useEffect(() => {
    if (isCesium && !shouldMountCesium) {
      setShouldMountCesium(true);
    }
  }, [isCesium, shouldMountCesium]);

  useEffect(() => {
    if (!isCesiumRuntimeReady) {
      return;
    }

    const resolvers = cesiumReadyResolversRef.current;
    if (resolvers.length === 0) {
      cesiumReadyPromiseRef.current = null;
      return;
    }

    cesiumReadyResolversRef.current = [];
    cesiumReadyPromiseRef.current = null;
    resolvers.forEach((resolve) => resolve());
  }, [isCesiumRuntimeReady]);

  const ensureCesiumReadyForTransition = useCallback(() => {
    if (isCesiumRuntimeReady) {
      return Promise.resolve();
    }

    setShouldMountCesium(true);

    if (cesiumReadyPromiseRef.current) {
      return cesiumReadyPromiseRef.current;
    }

    cesiumReadyPromiseRef.current = new Promise<void>((resolve) => {
      cesiumReadyResolversRef.current.push(resolve);
    });

    return cesiumReadyPromiseRef.current;
  }, [isCesiumRuntimeReady]);

  useEffect(() => {
    registerCallbacks({
      onEnsureCesiumReady: ensureCesiumReadyForTransition,
    });
  }, [ensureCesiumReadyForTransition, registerCallbacks]);

  useCesiumNavigationBridge({
    id: FLOODINGMAP_CESIUM_VIEW_ADAPTER_ID,
    scene: cesiumScene as unknown as SceneLike | null,
    isSyncEnabled: Boolean(cesiumScene),
    isCommitEnabled: isCesium && Boolean(cesiumScene) && initialViewApplied,
  });

  const models = useSelector(selectViewerModels);

  const markerAsset = models![CESIUM_CONFIG.markerKey!];
  const markerAnchorHeight = CESIUM_CONFIG.markerAnchorHeight ?? 10;

  // selection handling
  const { setSelection } = useSelection();

  const onGazetteerSelection = (selection: SearchResultItem | null) => {
    if (!selection) {
      //console.debug("onGazetteerSelection", selection);
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaTypeWithGEP(selection.type as ENDPOINT),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  const homeControlLeaflet = () => {
    if (homeCenter && routedMap?.leafletMap?.leafletElement) {
      routedMap.leafletMap.leafletElement.flyTo(homeCenter, homeLeafletZoom);
    }
  };

  const homeControlCesium = () => {
    if (!isCesium || !cesiumScene) return;

    flyViewStateInCesium(cesiumScene, DEFAULT_HOME_VIEW_STATE, {
      duration: 2,
      applyFov: false,
    });
  };

  const onHomeClick = () => {
    homeControlLeaflet();
    homeControlCesium();
  };

  useSelectionTopicMap();
  useSelectionCesium(
    getIsCesium,
    useMemo(
      () => ({
        markerAsset,
        markerAnchorHeight,
        isPrimaryStyle: true,
        withTerrainProvider: (cb) => ctx.withTerrainProvider(cb),
        withSurfaceProvider: (cb) => ctx.withSurfaceProvider(cb),
      }),
      [markerAsset, markerAnchorHeight, ctx]
    )
  );

  useEffect(() => {
    ctx.withViewer((viewer) => {
      // remove default cesium credit because no ion resource is used
      (
        viewer as unknown as {
          _cesiumWidget: { _creditContainer: { style: { display: string } } };
        }
      )._cesiumWidget._creditContainer.style.display = "none";
      ctx.requestRender();
    });
  }, [ctx]);

  const enableControlStateToggle = (controlState) => {
    return controlState.selectedSimulation !== 2;
  };

  const onToggleState = (toggleState, state) => {
    return state.selectedSimulation !== 2 && toggleState;
  };

  const appMenu = (
    <GenericModalApplicationMenu
      {...getCollabedHelpComponentConfig({
        version,
        versionString: version,
        reactCismapRHMVersion: reactCismapEnvirometricsVersion,
        email: EMAIL,
      })}
    />
  );

  if (!isInitialCameraResolved) {
    // initial camera state from URL not yet evaluated, don't render anything yet
    return null;
  }

  return (
    <div className="fixed w-full h-full">
      <div
        className="controls-container"
        style={{
          position: "absolute",
          top: "45px",
          left: "0px",
          bottom: "0px",
          zIndex: 600,
        }}
      >
        <ControlLayout ifStorybook={false}>
          <Control position="topleft" order={10}>
            <div className="flex flex-col">
              {/* <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right"> */}
              <ControlButtonStyler
                onClick={isLeaflet ? zoomInLeaflet : handleZoomInCesium}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                dataTestId="zoom-in-control"
                title="Maßstab vergrößern (Zoom in)"
              >
                <FontAwesomeIcon icon={faPlus} className="text-base" />
              </ControlButtonStyler>
              {/* </Tooltip> */}
              {/* <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right"> */}
              <ControlButtonStyler
                onClick={isLeaflet ? zoomOutLeaflet : handleZoomOutCesium}
                className="!rounded-t-none !border-t-[1px]"
                dataTestId="zoom-out-control"
                title="Maßstab verkleinern (Zoom out)"
              >
                <FontAwesomeIcon icon={faMinus} className="text-base" />
              </ControlButtonStyler>
              {/* </Tooltip> */}
            </div>
          </Control>
          <Control position="topleft" order={30}>
            <div className="flex flex-col">
              {/* <Tooltip title="Nach Norden ausrichten" placement="right"> */}
              <ControlButtonStyler
                useDisabledStyle={false}
                className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                disabled={isLeaflet}
                //ref={tourRefLabels.alignNorth}
                dataTestId="compass-control"
                title="Nach Norden ausrichten"
              >
                <PitchingCompass />
              </ControlButtonStyler>
              {/* </Tooltip> */}
              <MapFrameworkSwitcher nativeTooltip={true} />
            </div>
          </Control>
          <Control position="topleft" order={50}>
            <FullscreenControl />
          </Control>
          <Control position="topleft" order={60}>
            <RoutedMapLocateControl
              tourRefLabels={null}
              disabled={isCesium}
              nativeTooltip={true}
            />
          </Control>

          <Control position="topleft" order={70}>
            {/* <Tooltip
              title={
                "Zur Startposition:\nÜberflutungsbereich Unterdörnen, Barmen"
              }
              placement="right"
            > */}
            <ControlButtonStyler
              onClick={onHomeClick}
              dataTestId="home-control"
              title={
                "Zur Startposition:\nÜberflutungsbereich Unterdörnen, Barmen"
              }
            >
              <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
            </ControlButtonStyler>
            {/* </Tooltip> */}
          </Control>
          <Control position="bottomleft" order={10}>
            <div className="pl-1">
              <LibFuzzySearch
                gazData={gazData}
                //referenceSystem={referenceSystem}
                //referenceSystemDefinition={referenceSystemDefinition}
                pixelwidth={pixelwidth}
                onSelection={onGazetteerSelection}
                placeholder="Stadtteil | Adresse | POI | GEP"
              />
            </div>
          </Control>
        </ControlLayout>
      </div>

      <div
        className={
          isLeaflet
            ? "envirometricmap-container isMode2d"
            : "envirometricmap-container isMode3d"
        }
      >
        <EnviroMetricMap
          appMenu={appMenu}
          applicationMenuTooltipString="Anleitung | Hintergrund"
          initialState={initialEnviroMetricState}
          mapContainer={FloodingTopicMapContainer}
          emailaddress="hochwasser@stadt.wuppertal.de"
          config={config.config}
          contactButtonEnabled={false}
          homeZoom={homeLeafletZoom}
          homeCenter={homeCenter}
          modeSwitcherTitle="Hochwassergefahrenkarte Wuppertal"
          documentTitle="Hochwassergefahrenkarte Wuppertal"
          gazData={gazData}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
          gazetteerSearchControl={true}
          gazetteerSearchComponent={EmptySearchComponent}
          animationEnabled={false}
          toggleEnabled={true}
          customInfoBoxToggleState={hochwasserschutz}
          customInfoBoxToggleStateSetter={setHochwasserschutz}
          customInfoBoxDerivedToggleState={onToggleState}
          customInfoBoxDerivedToggleClickable={enableControlStateToggle}
        >
          {sync && (
            <CrossTabCommunicationControl hideWhenNoSibblingIsPresent={true} />
          )}
          <StateAwareChildren />
          <TopicMapSelectionContent />
        </EnviroMetricMap>
      </div>
      {shouldMountCesium && (
        <div
          ref={handleCesiumContainerRef}
          className={"map-container-3d"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 400,
          }}
        >
          <CustomViewer
            containerRef={container3dMapRef}
            cameraLimiterOptions={CESIUM_CONFIG.camera}
            homeValidationCenter={homeValidationCenter}
            initialCameraView={initialCameraView}
            constructorOptions={CONSTRUCTOR_OPTIONS}
            enableSceneStyles={false}
          ></CustomViewer>
        </div>
      )}
    </div>
  );
}

function App({ sync = false }: { sync?: boolean }) {
  const codec = useMemo(
    () =>
      createViewStateShareableHashCodec({
        defaultFovDeg: DEFAULT_HASH_FOV_DEG,
        zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
      }),
    []
  );

  return (
    <ViewStateProvider>
      <ViewStateNavigationManagerProvider
        codec={codec}
        label="app/hgk:3D"
        replace={true}
      >
        <FloodingmapAppContent sync={sync} />
      </ViewStateNavigationManagerProvider>
    </ViewStateProvider>
  );
}

export default App;
