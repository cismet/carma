// Built-in Modules
import { useMemo, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";

// 3rd party Modules
import { Modal } from "antd";
import { ErrorBoundary } from "react-error-boundary";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import { CarmaMapProviderWrapper } from "@carma-appframeworks/portals";
import {
  backgroundSettings,
  mobileInfo,
} from "@carma-collab/wuppertal/geoportal";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import {
  MapFrameworkSwitcherProvider,
  MobileWarningMessage,
  useMapFrameworkSwitcherContext,
} from "@carma-mapping/components";
import { createDefaultAnnotationToolPlugins } from "@carma-mapping/annotations/builtin-tools";
import {
  AnnotationOverlayRoots,
  AnnotationsProvider,
  useLocalAnnotationsRuntimePersistence,
} from "@carma-mapping/annotations/runtime";
import { useCesiumDevConsoleTrigger } from "@carma-mapping/engines/cesium/react/interactions";
import { useCesiumContext } from "@carma-mapping/engines/cesium/legacy";
import {
  FeatureFlagProvider,
  useFeatureFlags,
} from "@carma-providers/feature-flag";
import { HashStateProvider } from "@carma-providers/hash-state";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import {
  MapMeasurementsProvider,
  MEASUREMENT_MODE,
} from "@carma-commons/measurements";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import GeoportalLabelTextModal from "./components/annotations/GeoportalLabelTextModal";
import MapWrapper from "./components/GeoportalMap/controls/MapWrapper";
import LoginForm from "./components/LoginForm";

// import MapMeasurement from "./components/map-measure/MapMeasurement";
import TopNavbar from "./components/TopNavbar";
import { ObliqueProvider } from "./oblique/components/ObliqueProvider";
import { MatomoTracker } from "./MatomoTracker";

import { useAppConfig } from "./hooks/useAppConfig";
import { useManageLayers } from "./hooks/useManageLayers";
import { useSyncToken } from "./hooks/useSyncToken";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCesiumAnnotationLayerButton } from "./hooks/useCesiumAnnotationLayerButton";
import { useMeasurementLayerButton } from "./hooks/useMeasurementLayerButton";
import { useGeoportalCesiumAnnotationOverlayHost } from "./hooks/use-geoportal-cesium-annotation-overlay-host";
import { useGeoportalCesiumAnnotationToolPlugins } from "./hooks/use-geoportal-cesium-annotation-tool-plugins";
import { useGeoportalLabelTextRequest } from "./hooks/use-geoportal-label-text-request";
import { useGeoportalCesiumAnnotationModeLifecycle } from "./hooks/use-geoportal-cesium-annotation-mode-lifecycle";

import { APP_KEY, layerMap } from "./config";
import { geoportalMapStyleConfig } from "./config/mapStyleConfig";

import {
  CESIUM_ANNOTATION_CONFIG,
  CESIUM_CONFIG,
  CONFIG_BASE_URL,
  URL_PARAM_KEYS,
} from "./config/app.config";
import store from "./store";
import { featureFlagConfig } from "./config/featureFlags";

import { OBLIQUE_CONFIG, CAMERA_ID_TO_DIRECTION } from "./oblique/config";
import {
  COLORS_HEX,
  getHashParams,
  HASH_LAUNCH_MODE,
  isTruthyHashValue,
  resolveHashLaunchMode,
} from "@carma-commons/utils";

// Stable config objects
const MEASUREMENTS_BASE_CONFIG = {
  editableTitle: true,
  infoBoxHeaderColor: COLORS_HEX.ACCENT_MEASUREMENTS,
  snappingEnabled: false,
  snappingOnUpdate: false,
  localStorageKey: "@" + APP_KEY + ".app.measurements",
};

import { useAdhocFeatureRehydrate } from "./hooks/use-adhoc-feature-rehydrate";

import { getCustomFeatureFlags } from "./store/slices/layers";
import { getLayers } from "./store/slices/mapping";
import {
  getShowLoginModal,
  getUIMode,
  setShowLoginModal,
  setUIMode,
  UIMode,
} from "./store/slices/ui";
import { CESIUM_ANNOTATION_LAYER_ID } from "./components/annotations/cesium-annotations.constants";
import CesiumAnnotationShortcutManager from "./components/annotations/CesiumAnnotationShortcutManager";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";
// import { setDrawingShape } from "./store/slices/measurements";

const readInitialFrameworkFromHash = (): "leaflet" | "cesium" => {
  if (typeof window === "undefined") {
    return "leaflet";
  }

  const hashParams = getHashParams();

  if (isTruthyHashValue(hashParams[URL_PARAM_KEYS.measurements3d])) {
    return "cesium";
  }

  const mode = resolveHashLaunchMode(hashParams, {
    defaultMode: HASH_LAUNCH_MODE.TWO_D,
  });
  return mode === HASH_LAUNCH_MODE.THREE_D ? "cesium" : "leaflet";
};

function CesiumDevConsoleIntegration() {
  const flags = useFeatureFlags();
  // Explicitly pass through flag; hook no longer performs URL inference
  useCesiumDevConsoleTrigger({ isDeveloperMode: flags.isDeveloperMode });
  return null;
}

function AdhocFeatureRehydration() {
  useAdhocFeatureRehydrate();
  return null;
}

function MeasurementsWrapper({
  children,
  baseConfig,
  externalMode,
  setModeExternal,
}: {
  children: ReactNode;
  baseConfig: typeof MEASUREMENTS_BASE_CONFIG;
  externalMode: MEASUREMENT_MODE;
  setModeExternal: (mode: MEASUREMENT_MODE) => void;
}) {
  const flags = useFeatureFlags();

  // Memoize config to prevent recreation on every render
  const config = useMemo(
    () => ({
      ...baseConfig,
      snappingEnabled: flags.isSnappingEnabled ?? baseConfig.snappingEnabled,
    }),
    [baseConfig, flags.isSnappingEnabled]
  );

  return (
    <MapMeasurementsProvider
      externalMode={externalMode}
      setModeExternal={setModeExternal}
      config={config}
    >
      {children}
    </MapMeasurementsProvider>
  );
}

function MeasurementLayerSyncInner() {
  useMeasurementLayerButton();
  return null;
}

function CesiumAnnotationLayerSyncInner() {
  useCesiumAnnotationLayerButton();
  return null;
}

function CesiumAnnotationsWrapper({ children }: { children: ReactNode }) {
  const { getScene } = useCesiumContext();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const scene = getScene();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const isCesiumAnnotationMode = isCesium && uiMode === UIMode.MEASUREMENT;
  const annotationsVisible =
    isCesiumAnnotationMode &&
    layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID);
  useGeoportalCesiumAnnotationModeLifecycle({
    active: isCesiumAnnotationMode,
  });
  const { overlayContainer, overlayHost } =
    useGeoportalCesiumAnnotationOverlayHost(scene);
  const { labelTextModalState, requestLabelText } =
    useGeoportalLabelTextRequest({
      enabled: annotationsVisible,
    });
  const { initialPersistenceState, onPersistenceStateChange } =
    useLocalAnnotationsRuntimePersistence({
      enabled: true,
      storageKey: "@" + APP_KEY + ".app.cesium-annotations",
    });
  const annotationToolPlugins = useMemo(
    () =>
      createDefaultAnnotationToolPlugins({
        label: { requestLabelText },
        measurementLineStyle: CESIUM_ANNOTATION_CONFIG.measurementLineStyle,
        areaOcclusionStyle: CESIUM_ANNOTATION_CONFIG.areaOcclusionStyle,
      }),
    [requestLabelText]
  );
  const availableAnnotationToolPlugins =
    useGeoportalCesiumAnnotationToolPlugins(annotationToolPlugins);

  return (
    <LabelOverlayProvider host={overlayHost}>
      {overlayContainer
        ? createPortal(<AnnotationOverlayRoots />, overlayContainer)
        : null}
      <AnnotationsProvider
        scene={scene}
        plugins={availableAnnotationToolPlugins}
        initialActiveToolType={CESIUM_ANNOTATION_CONFIG.tools.defaultToolId}
        renderEnabled={annotationsVisible}
        initialPersistenceState={initialPersistenceState}
        onPersistenceStateChange={onPersistenceStateChange}
      >
        <CesiumAnnotationLayerSyncInner />
        {annotationsVisible ? <CesiumAnnotationShortcutManager /> : null}
        {children}
        <GeoportalLabelTextModal
          {...labelTextModalState}
          options={CESIUM_ANNOTATION_CONFIG.labelTextModal}
        />
      </AnnotationsProvider>
    </LabelOverlayProvider>
  );
}

function App({ published }: { published?: boolean }) {
  const dispatch = useDispatch();
  const showLoginModal = useSelector(getShowLoginModal);
  const isLoadingConfig = useAppConfig(CONFIG_BASE_URL, layerMap);
  useManageLayers(layerMap);
  const syncToken = useSyncToken();
  useKeyboardShortcuts();
  const customFeatureFlags = useSelector(getCustomFeatureFlags);
  const uiMode = useSelector(getUIMode);
  const mode =
    uiMode === UIMode.MEASUREMENT
      ? MEASUREMENT_MODE.MEASUREMENT
      : MEASUREMENT_MODE.DEFAULT;
  const handleSetMode = (newMode: MEASUREMENT_MODE) => {
    const newUIMode =
      newMode === MEASUREMENT_MODE.MEASUREMENT
        ? UIMode.MEASUREMENT
        : UIMode.DEFAULT;
    dispatch(setUIMode(newUIMode));
  };

  // Memoize config objects to prevent recreation on every render
  const featureFlagsMergedConfig = useMemo(
    () => ({ ...featureFlagConfig, ...customFeatureFlags }),
    [customFeatureFlags]
  );

  const overlayOptions = useMemo(
    () => ({ background: backgroundSettings }),
    []
  );
  const initialFramework = readInitialFrameworkFromHash();

  if (isLoadingConfig === null) {
    // wait for the loading state to be determined to prevent re-rendering
    console.debug("[CONFIG] APP - Waiting for config loading state...");
    return null;
  }

  const content = (
    <HashStateProvider>
      <FeatureFlagProvider config={featureFlagsMergedConfig}>
        <MatomoTracker>
          <CesiumDevConsoleIntegration />
          <MapFrameworkSwitcherProvider initialFramework={initialFramework}>
            <CarmaMapProviderWrapper
              cesiumOptions={CESIUM_CONFIG}
              overlayOptions={overlayOptions}
              mapStyleConfig={geoportalMapStyleConfig}
              store={store}
            >
              <ObliqueProvider
                config={OBLIQUE_CONFIG}
                fallbackDirectionConfig={CAMERA_ID_TO_DIRECTION}
              >
                <MeasurementsWrapper
                  externalMode={mode}
                  setModeExternal={handleSetMode}
                  baseConfig={MEASUREMENTS_BASE_CONFIG}
                >
                  <CesiumAnnotationsWrapper>
                    <MeasurementLayerSyncInner />
                    <ErrorBoundary FallbackComponent={AppErrorFallback}>
                      <AdhocFeatureRehydration />
                      <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
                        {isLoadingConfig && (
                          <div
                            id="loading"
                            className="absolute flex flex-col items-center text-white justify-center h-screen w-full bg-black/50 z-[9999999999999]"
                          >
                            <h2>Lade Konfiguration</h2>
                            <FontAwesomeIcon size="2x" icon={faSpinner} spin />
                          </div>
                        )}
                        {!published && <TopNavbar />}
                        <MapWrapper />
                        <MobileWarningMessage
                          headerText={mobileInfo.headerText}
                          bodyText={mobileInfo.bodyText}
                          confirmButtonText={mobileInfo.confirmButtonText}
                        />

                        <Modal
                          open={showLoginModal}
                          closable={false}
                          footer={null}
                          styles={{
                            content: {
                              padding: "0px",
                              width: window.innerWidth < 600 ? "100%" : "450px",
                            },
                          }}
                        >
                          <LoginForm
                            onSuccess={() => dispatch(setShowLoginModal(false))}
                            closeLoginForm={() =>
                              dispatch(setShowLoginModal(false))
                            }
                            showHelpText={false}
                            style={{ padding: "20px" }}
                          />
                        </Modal>
                      </div>
                    </ErrorBoundary>
                  </CesiumAnnotationsWrapper>
                </MeasurementsWrapper>
              </ObliqueProvider>
            </CarmaMapProviderWrapper>
          </MapFrameworkSwitcherProvider>
        </MatomoTracker>
      </FeatureFlagProvider>
    </HashStateProvider>
  );
  console.debug("RENDER: [GEOPORTAL] APP");

  return syncToken ? (
    <CrossTabCommunicationContextProvider role="sync" token={syncToken}>
      {content}
    </CrossTabCommunicationContextProvider>
  ) : (
    content
  );
}

export default App;
