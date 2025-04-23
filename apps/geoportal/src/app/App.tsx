// Built-in Modules
import { useState } from "react";

// 3rd party Modules
import { Button, Modal } from "antd";
import { ErrorBoundary } from "react-error-boundary";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import {
  backgroundSettings,
  mobileInfo,
} from "@carma-collab/wuppertal/geoportal";

import { TweakpaneProvider } from "@carma-commons/debug";

import {
  CarmaMapContextProvider,
  FeatureFlagProvider,
} from "@carma-apps/portals";

// Local Modules
import AppErrorFallback from "./components/AppErrorFallback";
import MapWrapper from "./components/GeoportalMap/controls/MapWrapper";

import MapMeasurement from "./components/map-measure/MapMeasurement";
import TopNavbar from "./components/TopNavbar";
import { ObliqueDataProvider } from "./oblique/components/ObliqueDataContext";

import { useAppConfig } from "./hooks/useAppConfig";
import { useManageLayers } from "./hooks/useManageLayers";
import { useSyncToken } from "./hooks/useSyncToken";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { use3dMode } from "./hooks/use3dMode";

import { layerMap } from "./config";
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

if (typeof global === "undefined") {
  window.global = window;
}
function App({ published }: { published?: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const isMobile = window.innerWidth < MIN_MOBILE_WIDTH;

  const isLoadingConfig = useAppConfig(CONFIG_BASE_URL, layerMap);
  useManageLayers(layerMap);
  use3dMode();
  const syncToken = useSyncToken();
  useKeyboardShortcuts();

  const content = (
    <FeatureFlagProvider config={featureFlagConfig}>
      <TweakpaneProvider>
        <CarmaMapContextProvider
          cesiumOptions={CESIUM_CONFIG}
          overlayOptions={{
            background: backgroundSettings,
          }}
        >
          <ObliqueDataProvider
            config={OBLIQUE_CONFIG}
            fallbackDirectionConfig={CAMERA_ID_TO_DIRECTION}
          >
            <ErrorBoundary FallbackComponent={AppErrorFallback}>
              <div
                className="flex flex-col w-full "
                style={{ height: "100dvh" }}
              >
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
                <Modal
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
                </Modal>
              </div>
            </ErrorBoundary>
          </ObliqueDataProvider>
        </CarmaMapContextProvider>
      </TweakpaneProvider>
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
