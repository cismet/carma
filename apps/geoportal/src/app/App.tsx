// Built-in Modules
import { useSelector } from "react-redux";

// 3rd party Modules
// (none needed)

// 1st party Modules
import { CrossTabCommunicationContextProvider } from "react-cismap/contexts/CrossTabCommunicationContextProvider";

// Monorepo Packages
import {
  backgroundSettings,
  mobileInfo,
} from "@carma-collab/wuppertal/geoportal";
import { CarmaMapProviderWrapper } from "@carma-appframeworks/portals";

// Local Modules
import MapWrapper from "./components/GeoportalMap/controls/MapWrapper";
import TopNavbar from "./components/TopNavbar";

import { useAppConfig } from "./hooks/useAppConfig";
import { useManageLayers } from "./hooks/useManageLayers";
import { useSyncToken } from "./hooks/useSyncToken";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

import { layerMap } from "./config";
import { CESIUM_CONFIG, CONFIG_BASE_URL } from "./config/app.config";

import { getShowLoginModal } from "./store/slices/ui";

// Side-Effect Imports
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./index.css";

// Oblique mode is now handled inside MapWrapper with scoped provider

function App({ published }: { published?: boolean }) {
  const showLoginModal = useSelector(getShowLoginModal);
  const isLoadingConfig = useAppConfig(CONFIG_BASE_URL, layerMap);
  useManageLayers(layerMap);
  const syncToken = useSyncToken();
  useKeyboardShortcuts();

  if (isLoadingConfig === null) {
    // wait for the loading state to be determined to prevent re-rendering
    console.debug("[CONFIG] APP - Waiting for config loading state...");
    return null;
  }

  console.debug("RENDER: [GEOPORTAL] APP");

  const content = (
    <>
      <TopNavbar />
      <MapWrapper />
    </>
  );

  return (
    <CarmaMapProviderWrapper
      overlayOptions={{ background: backgroundSettings }}
      cesiumOptions={CESIUM_CONFIG}
      mapStyleConfig={mobileInfo}
    >
      {syncToken ? (
        <CrossTabCommunicationContextProvider role="sync" token={syncToken}>
          {content}
        </CrossTabCommunicationContextProvider>
      ) : (
        content
      )}
    </CarmaMapProviderWrapper>
  );
}

export default App;
