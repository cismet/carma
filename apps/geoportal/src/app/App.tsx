// Built-in Modules
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
  MobileWarningMessage,
  TilesetLoadingProgress,
} from "@carma-mapping/components";
import {
  FeatureFlagProvider,
  useFeatureFlags,
} from "@carma/providers/feature-flag";
import { useCesiumDevConsoleTrigger } from "@carma-mapping/engines/cesium";
import {
  MapMeasurementsProvider,
  MapMeasurementsObjects,
  MEASUREMENT_MODE,
} from "@carma-commons/measurements";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import MapWrapper from "./components/GeoportalMap/controls/MapWrapper";
import LoginForm from "./components/LoginForm";

// import MapMeasurement from "./components/map-measure/MapMeasurement";
import TopNavbar from "./components/TopNavbar";
import { MatomoTracker } from "./MatomoTracker";
import { ObliqueProviderLazy } from "./components/ObliqueProviderLazy";
import {
  ObliqueLoaderProvider,
  useObliqueLoader,
} from "./contexts/ObliqueLoaderContext";

import { useAppConfig } from "./hooks/useAppConfig";
import { useManageLayers } from "./hooks/useManageLayers";
import { useSyncToken } from "./hooks/useSyncToken";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  useSyncSelectionToRedux,
  useSyncModelSelectionToRedux,
} from "./hooks/useSyncSelectionToRedux";

import { APP_KEY, layerMap } from "./config";
import { geoportalMapStyleConfig } from "./config/mapStyleConfig";

import { CESIUM_CONFIG, CONFIG_BASE_URL } from "./config/app.config";
import { featureFlagConfig } from "./config/featureFlags";

// OBLIQUE_CONFIG is now used in lazy loaded ObliqueProvider

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

function App({ published }: { published?: boolean }) {
  const dispatch = useDispatch();
  const showLoginModal = useSelector(getShowLoginModal);
  const isLoadingConfig = useAppConfig(CONFIG_BASE_URL, layerMap);
  useManageLayers(layerMap);
  const syncToken = useSyncToken();
  useKeyboardShortcuts();
  const customFeatureFlags = useSelector(getCustomFeatureFlags);

  // Oblique lazy loading
  const { isObliqueLoaded } = useObliqueLoader();

  // TODO: Remove when Redux is fully removed
  // Sync SelectionProvider state to Redux store
  const handleSelectionChange = useSyncSelectionToRedux();
  const handleModelSelectionChange = useSyncModelSelectionToRedux();
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

  if (isLoadingConfig === null) {
    // wait for the loading state to be determined to prevent re-rendering
    console.debug("[CONFIG] APP - Waiting for config loading state...");
    return null;
  }

  const content = (
    <ObliqueLoaderProvider>
      <FeatureFlagProvider
        config={{ ...featureFlagConfig, ...customFeatureFlags }}
      >
        <MatomoTracker>
          <CesiumDevConsoleIntegration />
          <CarmaMapProviderWrapper
            cesiumOptions={CESIUM_CONFIG}
            overlayOptions={{
              background: backgroundSettings,
            }}
            mapStyleConfig={geoportalMapStyleConfig}
            onSelectionChange={handleSelectionChange}
            onModelSelectionChange={handleModelSelectionChange}
          >
            {isObliqueLoaded ? (
              <ObliqueProviderLazy>
                <MapMeasurementsProvider
                  externalMode={mode}
                  setModeExternal={handleSetMode}
                  config={{
                    localStorageKey: "@" + APP_KEY + ".app.measurements",
                  }}
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
                      <TilesetLoadingProgress />
                      <MapMeasurementsObjects />
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
                </MapMeasurementsProvider>
              </ObliqueProviderLazy>
            ) : (
              <MapMeasurementsProvider
                externalMode={mode}
                setModeExternal={handleSetMode}
                config={{
                  localStorageKey: "@" + APP_KEY + ".app.measurements",
                }}
              >
                <ErrorBoundary FallbackComponent={AppErrorFallback}>
                  <div className={TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}>
                    {isLoadingConfig && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: "rgba(255, 255, 255, 0.8)",
                          zIndex: 9999,
                        }}
                      >
                        <div>Loading configuration...</div>
                      </div>
                    )}
                    <TopNavbar />
                    <MapWrapper />
                    <Modal
                      open={showLoginModal}
                      onCancel={() => dispatch(setShowLoginModal(false))}
                      footer={null}
                      style={{
                        zIndex: 99999999,
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
              </MapMeasurementsProvider>
            )}
          </CarmaMapProviderWrapper>
        </MatomoTracker>
      </FeatureFlagProvider>
    </ObliqueLoaderProvider>
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
