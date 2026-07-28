// Built-in Modules
import { useMemo, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";

// 3rd party Modules
import { Modal } from "antd";
import { ErrorBoundary } from "react-error-boundary";
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
import {
  COLORS_HEX,
  TAILWIND_CLASSNAMES_FULLSCREEN_FIXED,
  useDeployment,
} from "@carma-commons/utils";
import {
  MapFrameworkSwitcherProvider,
  MobileWarningMessage,
} from "@carma-mapping/components";
import { useCesiumDevConsoleTrigger } from "@carma-mapping/engines/cesium/react/interactions";
import {
  HASH_ZOOM_CONVENTION,
  type ShareableViewStateHashCodecOptions,
  ViewStateNavigationManagerProvider,
  ViewStateProvider,
} from "@carma-mapping/engines-interop/view-state";
import {
  FeatureFlagProvider,
  useFeatureFlags,
} from "@carma-providers/feature-flag";
import {
  LayerCatalogProvider,
  type CategoryDefinition,
  type LayerCatalogConfig,
} from "@carma-mapping/layers";
import { HashStateProvider } from "@carma-providers/hash-state";
import {
  MapMeasurementsProvider,
  MEASUREMENT_MODE,
} from "@carma-commons/measurements";

import { AddonHost, type Addon } from "@carma-mapping/addons";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import { AnnotationProvider } from "./components/annotations/AnnotationProvider";
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
import { useMeasurementLayerButton } from "./hooks/useMeasurementLayerButton";
import { useGeoportalAppSearchParams } from "./hooks/use-geoportal-app-search-params";
import { useAdhocFeatureRehydrate } from "./hooks/use-adhoc-feature-rehydrate";

import { APP_KEY, STORAGE_PREFIX, layerMap } from "./config";
import { layerCatalogConfig } from "./constants/discover";
import { geoportalCategoryDefinitions } from "./constants/fachzwillinge";
import { geoportalMapStyleConfig } from "./config/mapStyleConfig";
import { defaultCesiumState } from "./config/cesium/store.config";

import {
  CESIUM_CONFIG,
  CONFIG_BASE_URL,
  DEFAULT_CAMERA_FOV_DEG,
} from "./config/app.config";
import store, { geoportalInitialHashState } from "./store";
import { getFeatureFlagConfig } from "./config/featureFlags";

import { OBLIQUE_CONFIG, CAMERA_ID_TO_DIRECTION } from "./oblique/config";

import { getCustomFeatureFlags } from "./store/slices/layers";
import {
  getShowLoginModal,
  getUIMode,
  setShowLoginModal,
  setUIMode,
  UIMode,
} from "./store/slices/ui";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";
// import { setDrawingShape } from "./store/slices/measurements";

// Stable config objects
const MEASUREMENTS_BASE_CONFIG = {
  editableTitle: true,
  infoBoxHeaderColor: COLORS_HEX.ACCENT_MEASUREMENTS,
  snappingEnabled: false,
  snappingOnUpdate: false,
  localStorageKey: "@" + APP_KEY + ".app.measurements",
};

const VIEW_STATE_HASH_CODEC_OPTIONS: ShareableViewStateHashCodecOptions = {
  defaultFovDeg: DEFAULT_CAMERA_FOV_DEG,
  zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
  cameraLimiterOptions: CESIUM_CONFIG.camera,
};

const MAP_OVERLAY_OPTIONS = {
  background: backgroundSettings,
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

function GeoportalAppSearchParamsIntegration() {
  useGeoportalAppSearchParams();
  return null;
}

function App({
  published,
  catalogConfig = layerCatalogConfig,
  categories = geoportalCategoryDefinitions,
  addons,
}: {
  published?: boolean;
  /** route-specific catalog config, e.g. the filtered /gesundheit catalog */
  catalogConfig?: LayerCatalogConfig;
  /** route-specific category registry, e.g. with a Fachzwilling's Workflows */
  categories?: CategoryDefinition[];
  addons?: Addon[];
}) {
  const dispatch = useDispatch();
  const showLoginModal = useSelector(getShowLoginModal);
  const isLoadingConfig = useAppConfig(CONFIG_BASE_URL, layerMap);
  useManageLayers(layerMap);
  const syncToken = useSyncToken();
  useKeyboardShortcuts();
  const customFeatureFlags = useSelector(getCustomFeatureFlags);
  const deployment = useDeployment();
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
    () => ({ ...getFeatureFlagConfig(deployment), ...customFeatureFlags }),
    [deployment, customFeatureFlags]
  );

  const { initialMapFramework } = geoportalInitialHashState;

  if (isLoadingConfig === null) {
    // wait for the loading state to be determined to prevent re-rendering
    console.debug("[CONFIG] APP - Waiting for config loading state...");
    return null;
  }

  const content = (
    <HashStateProvider>
      <FeatureFlagProvider config={featureFlagsMergedConfig}>
        <LayerCatalogProvider
          config={catalogConfig}
          categories={categories}
          appKey={APP_KEY}
          storagePrefix={STORAGE_PREFIX}
          legacyFavoritesKey={`persist:@${APP_KEY}.${STORAGE_PREFIX}.app.layers`}
        >
          <MatomoTracker>
            <CesiumDevConsoleIntegration />
            <MapFrameworkSwitcherProvider
              initialFramework={initialMapFramework}
            >
              <CarmaMapProviderWrapper
                cesiumOptions={CESIUM_CONFIG}
                overlayOptions={MAP_OVERLAY_OPTIONS}
                mapStyleConfig={geoportalMapStyleConfig}
                store={store}
                defaultRuntimeState={defaultCesiumState}
              >
                <ObliqueProvider
                  config={OBLIQUE_CONFIG}
                  fallbackDirectionConfig={CAMERA_ID_TO_DIRECTION}
                >
                  <GeoportalAppSearchParamsIntegration />
                  <AddonHost addons={addons} />
                  <MeasurementsWrapper
                    externalMode={mode}
                    setModeExternal={handleSetMode}
                    baseConfig={MEASUREMENTS_BASE_CONFIG}
                  >
                    <AnnotationProvider>
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
                              <FontAwesomeIcon
                                size="2x"
                                icon={faSpinner}
                                spin
                              />
                            </div>
                          )}
                          {!published && <TopNavbar />}
                          <ViewStateProvider>
                            <ViewStateNavigationManagerProvider
                              shareableHashOptions={
                                VIEW_STATE_HASH_CODEC_OPTIONS
                              }
                              replace={true}
                            >
                              <MapWrapper />
                            </ViewStateNavigationManagerProvider>
                          </ViewStateProvider>
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
                                width:
                                  window.innerWidth < 600 ? "100%" : "450px",
                              },
                            }}
                          >
                            <LoginForm
                              onSuccess={() =>
                                dispatch(setShowLoginModal(false))
                              }
                              closeLoginForm={() =>
                                dispatch(setShowLoginModal(false))
                              }
                              showHelpText={false}
                              style={{ padding: "20px" }}
                            />
                          </Modal>
                        </div>
                      </ErrorBoundary>
                    </AnnotationProvider>
                  </MeasurementsWrapper>
                </ObliqueProvider>
              </CarmaMapProviderWrapper>
            </MapFrameworkSwitcherProvider>
          </MatomoTracker>
        </LayerCatalogProvider>
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
