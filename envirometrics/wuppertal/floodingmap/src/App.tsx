import { useCallback, useContext, useEffect, useState } from "react";

import EnviroMetricMap from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMap";
import { version as cismapEnvirometricsVersion } from "@cismet-dev/react-cismap-envirometrics-maps/meta";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import CrossTabCommunicationControl from "react-cismap/CrossTabCommunicationControl";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import {
  TopicMapSelectionContent,
  useGazData,
  useHashLaunchMode,
} from "@carma-appframeworks/portals";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/hochwassergefahrenkarte";
import {
  detectWebGLContext,
  getApplicationVersion,
  HASH_LAUNCH_MODE,
} from "@carma-commons/utils";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import {
  flyViewStateInCesium,
  HASH_ZOOM_CONVENTION,
  type ShareableViewStateHashCodecOptions,
  ViewStateNavigationManagerProvider,
  ViewStateProvider,
} from "@carma-mapping/engines-interop/view-state";
import {
  CesiumHost,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/react/runtime";
import { EmptySearchComponent } from "@carma-mapping/fuzzy-search";

import { StateAwareChildren } from "./components/StateAwareChildren";
import FloodingTopicMapContainer from "./components/FloodingTopicMapContainer";
import { MapControls } from "./components/MapControls";
import config from "./config";
import { EMAIL } from "./config/app.config";
import {
  CESIUM_CONFIG,
  CONSTRUCTOR_OPTIONS,
} from "./config/cesium/cesium.config";
import { useDisableInfoBoxMapClicks } from "./hooks/useDisableInfoBoxMapClicks";
import { useFloodingCesiumHost } from "./hooks/useFloodingCesiumHost";
import { useFloodingmapInitialValues } from "./hooks/useFloodingmapInitialValues";
import { useFloodingSelection } from "./hooks/useFloodingSelection";
import versionData from "./version.json";

import "cesium/Build/Cesium/Widgets/widgets.css";

const DEFAULT_HASH_FOV_DEG = 45;
const VIEW_STATE_HASH_CODEC_OPTIONS: ShareableViewStateHashCodecOptions = {
  defaultFovDeg: DEFAULT_HASH_FOV_DEG,
  zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
  cameraLimiterOptions: CESIUM_CONFIG.camera,
};

const enableControlStateToggle = (controlState) =>
  controlState.selectedSimulation !== 2;

const onToggleState = (toggleState, state) =>
  state.selectedSimulation !== 2 && toggleState;

function FloodingmapAppContent({ sync = false }: { sync?: boolean }) {
  const version = getApplicationVersion(versionData);
  const [hochwasserschutz, setHochwasserschutz] = useState(true);

  // 3D capability gate: detect WebGL once; without it, stay 2D and never mount Cesium.
  const [is3dSupported] = useState(() => {
    let supported = false;
    detectWebGLContext((flag) => {
      supported = flag;
    });
    return supported;
  });

  // Resolve launch mode from hash, set framework, clean up flags.
  useHashLaunchMode({
    defaultMode: is3dSupported
      ? HASH_LAUNCH_MODE.THREE_D
      : HASH_LAUNCH_MODE.TWO_D,
  });

  const {
    defaultHomeViewState,
    homeCenter,
    homeLeafletZoom,
    homeValidationCenter,
    initialCameraView,
    initialEnviroMetricState,
    isInitialCameraResolved,
  } = useFloodingmapInitialValues();

  const { gazData } = useGazData();
  const { isCesium, isLeaflet, setActiveFrameworkLeaflet } =
    useMapFrameworkSwitcherContext();
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);
  const cesiumScene = useCesiumContext().getScene();

  // Absorb info-box clicks so they don't fall through to the map (2D + 3D).
  useDisableInfoBoxMapClicks(routedMap?.leafletMap?.leafletElement ?? null);

  // Cesium-host wiring (framework registration, lazy mount + ready gate) and gazetteer/selection wiring.
  const { shouldMountCesium, handleCesiumHostChange } =
    useFloodingCesiumHost(is3dSupported);
  const { onGazetteerSelection } = useFloodingSelection();

  // Without WebGL, never sit in 3D even if a 3d hash flag launched it.
  useEffect(() => {
    if (!is3dSupported && isCesium) {
      setActiveFrameworkLeaflet();
    }
  }, [is3dSupported, isCesium, setActiveFrameworkLeaflet]);

  const onHomeClick = useCallback(() => {
    if (homeCenter && routedMap?.leafletMap?.leafletElement) {
      routedMap.leafletMap.leafletElement.flyTo(homeCenter, homeLeafletZoom);
    }
    if (isCesium && cesiumScene) {
      flyViewStateInCesium(cesiumScene, defaultHomeViewState, {
        duration: 2,
        applyFov: false,
      });
    }
  }, [
    homeCenter,
    homeLeafletZoom,
    routedMap,
    isCesium,
    cesiumScene,
    defaultHomeViewState,
  ]);

  const appMenu = (
    <GenericModalApplicationMenu
      {...getCollabedHelpComponentConfig({
        version,
        versionString: version,
        reactCismapRHMVersion: cismapEnvirometricsVersion,
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
        <MapControls
          is3dSupported={is3dSupported}
          onHomeClick={onHomeClick}
          onGazetteerSelection={onGazetteerSelection}
        />
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
        <CesiumHost
          className={"map-container-3d"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 400,
          }}
          onHostChange={handleCesiumHostChange}
          cameraLimiterOptions={CESIUM_CONFIG.camera}
          homeValidationCenter={homeValidationCenter}
          initialCameraView={initialCameraView}
          constructorOptions={CONSTRUCTOR_OPTIONS}
        />
      )}
    </div>
  );
}

function App({ sync = false }: { sync?: boolean }) {
  return (
    <ViewStateProvider>
      <ViewStateNavigationManagerProvider
        shareableHashOptions={VIEW_STATE_HASH_CODEC_OPTIONS}
        debugLabel="app/hgk:3D"
        replace={true}
      >
        <FloodingmapAppContent sync={sync} />
      </ViewStateNavigationManagerProvider>
    </ViewStateProvider>
  );
}

export default App;
