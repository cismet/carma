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
import { useHashState } from "@carma-providers/hash-state";
import { readInitialCameraViewFromSceneViewState } from "@carma-mapping/engines/cesium/react/scene-state";
import { ENDPOINT, isAreaTypeWithGEP } from "@carma-commons/resources";
import { getApplicationVersion, HASH_LAUNCH_MODE } from "@carma-commons/utils";

// TODO fix collab path names
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";

import { getDegreesFromCartesian } from "@carma/cesium";

import {
  CustomViewer,
  PitchingCompass,
  type InitialCameraView,
  selectViewerHome,
  selectViewerModels,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/engines/cesium";
import {
  CesiumSceneStateHashSync,
  CesiumSceneStateProvider,
  type SceneLike,
  useInitialSceneViewState,
} from "@carma-mapping/engines/cesium/react/scene-state";
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

import config from "./config";
import { EMAIL, HOME_ZOOM } from "./config/app.config";
import {
  CESIUM_CONFIG,
  CONSTRUCTOR_OPTIONS,
} from "./config/cesium/cesium.config";

import "cesium/Build/Cesium/Widgets/widgets.css";

const DEFAULT_HASH_RANGE_M = 750;
const DEFAULT_HASH_FOV_DEG = 45;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseHashNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const readInitialCameraViewFromInitialViewState = (
  initialViewState: ReturnType<
    typeof useInitialSceneViewState
  >["initialViewState"]
): InitialCameraView | undefined => {
  return readInitialCameraViewFromSceneViewState(initialViewState, {
    defaultRangeM: DEFAULT_HASH_RANGE_M,
  }) as InitialCameraView | undefined;
};

function App({ sync = false }: { sync?: boolean }) {
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
  const { getHashValues } = useHashState();
  const { initialViewState, isResolved: isInitialCameraResolved } =
    useInitialSceneViewState();
  const initialHashValues = getHashValues();
  const initialQueryX = parseHashNumber(initialHashValues.qx);
  const initialQueryY = parseHashNumber(initialHashValues.qy);
  const initialEnviroMetricState = useMemo(() => {
    const restoredQueryPosition =
      isFiniteNumber(initialQueryX) && isFiniteNumber(initialQueryY)
        ? ([initialQueryX, initialQueryY] as [number, number])
        : undefined;

    return {
      ...config.initialState,
      featureInfoModeActivated: Boolean(restoredQueryPosition),
      currentFeatureInfoPosition: restoredQueryPosition,
    };
  }, [initialQueryX, initialQueryY]);
  const initialCameraView = useMemo(
    () => readInitialCameraViewFromInitialViewState(initialViewState),
    [initialViewState]
  );

  const ctx = useCesiumContext();
  const { getScene, getTerrainProvider, getSurfaceProvider, isViewerReady } =
    ctx;
  const cesiumScene = getScene();
  const homeControl = useHomeControl();
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
  const homePosition = useSelector(selectViewerHome);

  const handleCesiumContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      container3dMapRef.current = node;
      setCesiumContainerElement(node);
    },
    []
  );

  // Register map frameworks with switcher
  const leafletMap = routedMap?.leafletMap?.leafletElement ?? null;
  const terrainProvider = getTerrainProvider();
  const surfaceProvider = getSurfaceProvider();

  const frameworkOptions = useMemo(() => {
    if (
      !leafletMap ||
      !cesiumScene ||
      !cesiumContainerElement ||
      !isViewerReady ||
      !routedMap
    ) {
      return null;
    }

    return {
      leafletMap,
      cesiumScene,
      cesiumContainer: cesiumContainerElement,
      terrainProviders: {
        TERRAIN: terrainProvider ?? null,
        SURFACE: surfaceProvider ?? null,
      },
    };
  }, [
    leafletMap,
    cesiumScene,
    cesiumContainerElement,
    terrainProvider,
    surfaceProvider,
    isViewerReady,
    routedMap,
  ]);

  useRegisterMapFramework(frameworkOptions);

  const homeCenter = useMemo(() => {
    if (!homePosition) {
      return null;
    }
    const { longitude, latitude } = getDegreesFromCartesian(homePosition);
    const center = [latitude, longitude];

    return center;
  }, [homePosition]);

  const { isCesium, isLeaflet, getIsCesium } = useMapFrameworkSwitcherContext();

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
      //console.debug("topicMapHomeClick", homeCenter, homePosition);
      routedMap.leafletMap.leafletElement.flyTo(homeCenter, HOME_ZOOM);
    }
  };

  const onHomeClick = () => {
    homeControl();
    homeControlLeaflet();
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
          homeZoom={HOME_ZOOM}
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
        <CesiumSceneStateProvider
          scene={cesiumScene as unknown as SceneLike | null}
        >
          <CesiumSceneStateHashSync
            enabled={isCesium && Boolean(cesiumScene)}
            replace={true}
            label="app/hgk:3D"
          />
          <CustomViewer
            containerRef={container3dMapRef}
            cameraLimiterOptions={CESIUM_CONFIG.camera}
            initialCameraView={initialCameraView}
            constructorOptions={CONSTRUCTOR_OPTIONS}
            enableSceneStyles={false}
          ></CustomViewer>
        </CesiumSceneStateProvider>
      </div>
    </div>
  );
}

export default App;
