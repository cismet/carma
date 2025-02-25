// Built-in Modules
import { useEffect, useState } from "react";

// 3rd party Modules

import { Button, Modal } from "antd";
import { ErrorBoundary } from "react-error-boundary";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
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

import type { AppDispatch } from "./store";
import { getIfPopupOpend } from "./store/slices/print";

import {
  getUIAllowChanges,
  getUIMode,
  getZenMode,
  setUIShowLayerHideButtons,
} from "./store/slices/ui";

import { layerMap } from "./config";
import { CESIUM_CONFIG } from "./config/app.config";
import { featureFlagConfig } from "./config/featureFlags";
import {
  useRouteLogging,
  useInitializeMapLayers,
  useSyncAndConfig,
} from "./App.hooks";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";

if (typeof global === "undefined") {
  window.global = window;
}

function App({ published }: { published?: boolean }) {
  const dispatch: AppDispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();

  const allowUiChanges = useSelector(getUIAllowChanges);
  const uiMode = useSelector(getUIMode);
  const zenMode = useSelector(getZenMode);
  const ifPopupPrintOpened = useSelector(getIfPopupOpend);

  // Use hooks
  const { syncToken, loadingConfig } = useSyncAndConfig({
    searchParams,
    setSearchParams,
    published,
  });
  useRouteLogging();
  useInitializeMapLayers(layerMap);

  // Local state
  const [isModalOpen, setIsModalOpen] = useState(true);
  const isMobile = window.innerWidth < 600;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        dispatch(setUIShowLayerHideButtons(true));
      }

      // if (e.key === "Escape") {
      //   if (uiMode === "print" && !ifPopupPrintOpened) {
      //     dispatch(setUIMode("default"));
      //   }
      //   dispatch(changeIfPopupOpend(false));
      // }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (allowUiChanges) {
        dispatch(setUIShowLayerHideButtons(false));
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onKeyUp);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onKeyUp);
    };
  }, [allowUiChanges]);

  const content = (
    <FeatureFlagProvider config={featureFlagConfig}>
      <TweakpaneProvider>
        <CarmaMapContextProvider
          cesiumOptions={CESIUM_CONFIG}
          overlayOptions={{
            background: backgroundSettings,
          }}
        >
          <ErrorBoundary FallbackComponent={AppErrorFallback}>
            <div className="flex flex-col w-full " style={{ height: "100dvh" }}>
              {loadingConfig && (
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
