// Built-in Modules
import { useMemo } from "react";
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
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import {
  MapFrameworkSwitcherProvider,
  MobileWarningMessage,
} from "@carma-mapping/components";
import {
  FeatureFlagProvider,
  useFeatureFlags,
} from "@carma-providers/feature-flag";
import { HashStateProvider } from "@carma-providers/hash-state";
import { useCesiumDevConsoleTrigger } from "@carma-mapping/engines/cesium";
import {
  MapMeasurementsProvider,
  MEASUREMENT_MODE,
} from "@carma-commons/measurements";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
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

import { APP_KEY, layerMap } from "./config";
import { geoportalMapStyleConfig } from "./config/mapStyleConfig";

import { CESIUM_CONFIG, CONFIG_BASE_URL } from "./config/app.config";
import store from "./store";
import { featureFlagConfig } from "./config/featureFlags";

import { OBLIQUE_CONFIG, CAMERA_ID_TO_DIRECTION } from "./oblique/config";

// Stable config objects
const MEASUREMENTS_BASE_CONFIG = {
  editableTitle: true,
  snappingEnabled: false,
  snappingOnUpdate: false,
  localStorageKey: "@" + APP_KEY + ".app.measurements",
};

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

function CesiumDevConsoleIntegration() {
  const flags = useFeatureFlags();
  // Explicitly pass through flag; hook no longer performs URL inference
  useCesiumDevConsoleTrigger({ isDeveloperMode: flags.isDeveloperMode });
  return null;
}

function MeasurementsWrapper({
  children,
  baseConfig,
  externalMode,
  setModeExternal,
}: {
  children: React.ReactNode;
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
    [flags.isSnappingEnabled]
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
          <MapFrameworkSwitcherProvider initialFramework="leaflet">
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
                  <ErrorBoundary FallbackComponent={AppErrorFallback}>
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
