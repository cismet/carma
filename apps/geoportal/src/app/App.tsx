// Built-in Modules
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

// 3rd party Modules
import { Button, Modal } from "antd";
import { ErrorBoundary } from "react-error-boundary";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import {
  CarmaMapProviderWrapper,
  FeatureFlagProvider,
} from "@carma-apps/portals";
import {
  backgroundSettings,
  mobileInfo,
} from "@carma-collab/wuppertal/geoportal";
import { TweakpaneProvider } from "@carma-commons/debug";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { MobileWarningMessage } from "@carma-mapping/components";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import MapWrapper from "./components/GeoportalMap/controls/MapWrapper";
import LoginForm from "./components/LoginForm";

import MapMeasurement from "./components/map-measure/MapMeasurement";
import TopNavbar from "./components/TopNavbar";
import { ObliqueProvider } from "./oblique/components/ObliqueProvider";
import { MatomoTracker } from "./MatomoTracker";

import { useAppConfig } from "./hooks/useAppConfig";
import { useManageLayers } from "./hooks/useManageLayers";
import { useSyncToken } from "./hooks/useSyncToken";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

import { layerMap } from "./config";
import { geoportalMapStyleConfig } from "./config/mapStyleConfig";

import {
  CESIUM_CONFIG,
  CONFIG_BASE_URL,
  MIN_MOBILE_WIDTH,
} from "./config/app.config";
import { featureFlagConfig } from "./config/featureFlags";

import { OBLIQUE_CONFIG, CAMERA_ID_TO_DIRECTION } from "./oblique/config";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";
import { getCustomFeatureFlags } from "./store/slices/layers";

declare global {
  interface Window {
    global?: typeof window;
  }
}

if (typeof global === "undefined") {
  window.global = window;
}
function App({ published }: { published?: boolean }) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const isLoadingConfig = useAppConfig(CONFIG_BASE_URL, layerMap);
  useManageLayers(layerMap);
  const syncToken = useSyncToken();
  useKeyboardShortcuts();
  const customFeatureFlags = useSelector(getCustomFeatureFlags);

  if (isLoadingConfig === null) {
    // wait for the loading state to be determined to prevent re-rendering
    console.debug("[CONFIG] APP - Waiting for config loading state...");
    return null;
  }

  const content = (
    <FeatureFlagProvider
      config={{ ...featureFlagConfig, ...customFeatureFlags }}
    >
      <MatomoTracker>
        <TweakpaneProvider>
          <CarmaMapProviderWrapper
            cesiumOptions={CESIUM_CONFIG}
            overlayOptions={{
              background: backgroundSettings,
            }}
            mapStyleConfig={geoportalMapStyleConfig}
          >
            <ObliqueProvider
              config={OBLIQUE_CONFIG}
              fallbackDirectionConfig={CAMERA_ID_TO_DIRECTION}
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
                  <MapMeasurement />
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
                      onSuccess={() => setShowLoginModal(false)}
                      closeLoginForm={() => setShowLoginModal(false)}
                      showHelpText={false}
                      style={{ padding: "20px" }}
                    />
                  </Modal>

                  {/* <Modal
                  title={mobileInfo.headerText}
                  open={isModalOpen && isMobile}
                  closable={false}
                  closeIcon={false}
                  footer={[
                    <Button
                      key="confirm"
                      type="primary"
                      onClick={() => setIsModalOpen(false)}
                    >
                      {mobileInfo.confirmButtonText}
                    </Button>,
                  ]}
                >
                  <p>{mobileInfo.bodyText}</p>
                </Modal> */}
                </div>
              </ErrorBoundary>
            </ObliqueProvider>
          </CarmaMapProviderWrapper>
        </TweakpaneProvider>
      </MatomoTracker>
    </FeatureFlagProvider>
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
