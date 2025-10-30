// Built-in Modules
import { useCallback, useMemo, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";

// 3rd party Modules
import { Modal } from "antd";
import { ErrorBoundary } from "react-error-boundary";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import {
  PortalContextProvider,
  usePortalContext,
} from "@carma-appframeworks/portals";
import { mobileInfo } from "@carma-collab/wuppertal/geoportal";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { MobileWarningMessage } from "@carma-mapping/components";
import { FeatureFlagProvider } from "@carma/providers/feature-flag";
import {
  MapMeasurementsProvider,
  MapMeasurementsObjects,
  MEASUREMENT_MODE,
} from "@carma-commons/measurements";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import GeoportalMap from "./components/GeoportalMap";
import LoginForm from "./components/LoginForm";
import { TopicMapReduxSyncProvider } from "./components/TopicMapReduxSyncProvider";

// import MapMeasurement from "./components/map-measure/MapMeasurement";
import TopNavbar from "./components/TopNavbar";
import { MatomoTracker } from "./MatomoTracker";

import { useAppConfig } from "./hooks/useAppConfig";
import { useManageLayers } from "./hooks/useManageLayers";
import { useSyncToken } from "./hooks/useSyncToken";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

import { portalConfig, featureFlagConfig, APP_KEY, layerMap } from "./config";

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

function App({ published }: { published?: boolean }) {
  const dispatch = useDispatch();
  const showLoginModal = useSelector(getShowLoginModal);
  const isLoadingConfig = useAppConfig(
    portalConfig.configBaseUrl || "",
    layerMap
  );

  console.debug("[CONFIG] APP - isLoadingConfig state:", isLoadingConfig);
  useManageLayers(layerMap);
  const syncToken = useSyncToken();
  useKeyboardShortcuts();
  const customFeatureFlags = useSelector(getCustomFeatureFlags);
  const uiMode = useSelector(getUIMode);
  const mode =
    uiMode === UIMode.MEASUREMENT
      ? MEASUREMENT_MODE.MEASUREMENT
      : MEASUREMENT_MODE.DEFAULT;
  const handleSetMode = useCallback(
    (newMode: MEASUREMENT_MODE) => {
      const newUIMode =
        newMode === MEASUREMENT_MODE.MEASUREMENT
          ? UIMode.MEASUREMENT
          : UIMode.DEFAULT;
      dispatch(setUIMode(newUIMode));
    },
    [dispatch]
  );

  const normalizedFeatureFlagConfig = useMemo(() => {
    return {
      ...featureFlagConfig,
      ...customFeatureFlags,
    };
  }, [customFeatureFlags]);

  if (isLoadingConfig === null) {
    // wait for the loading state to be determined to prevent re-rendering
    console.debug("[CONFIG] APP - Waiting for config loading state...");
    return null;
  }

  const content = (
    <FeatureFlagProvider config={normalizedFeatureFlagConfig}>
      <MatomoTracker>
        <PortalContextProvider config={portalConfig}>
          <TopicMapReduxSyncProvider>
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
                  <MapMeasurementsObjects />
                  <GeoportalMap />
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
                      closeLoginForm={() => dispatch(setShowLoginModal(false))}
                      showHelpText={false}
                      style={{ padding: "20px" }}
                    />
                  </Modal>
                </div>
              </ErrorBoundary>
            </MapMeasurementsProvider>
          </TopicMapReduxSyncProvider>
        </PortalContextProvider>
      </MatomoTracker>
    </FeatureFlagProvider>
  );

  return syncToken ? (
    <CrossTabCommunicationContextProvider role="sync" token={syncToken}>
      {content}
    </CrossTabCommunicationContextProvider>
  ) : (
    content
  );
}

export default App;
