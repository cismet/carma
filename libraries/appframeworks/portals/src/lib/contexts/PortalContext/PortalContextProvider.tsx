import { createContext, useRef, useEffect, useState, useMemo } from "react";
import { AuthProvider } from "@carma/providers/auth";
import { SandboxedEvalProvider } from "../../components/SandboxedEvalProvider";
import { GazDataProvider } from "../../components/GazDataProvider";
import { defaultGazDataConfig } from "@carma/resources";
import { SelectionProvider } from "../../components/SelectionProvider";
import { TransitionContextProvider } from "@carma-mapping/map-transition-2d-3d";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium/core";
import {
  CarmaTopicMapContextProvider,
  useCarmaTopicMapContext,
} from "@carma-mapping/engines/carma-cismap";
import { MapLibreContextProvider } from "@carma-mapping/engines/maplibre";
import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";

import { validatePortalCesiumConfig } from "../validate-portal-config";
import { PortalStateProvider } from "./PortalStateContext";
import { HashStateProvider } from "../HashStateProvider";
import type { PortalProviderProps, PortalConfig } from "../../types/portal";
import type { GazDataConfig } from "@carma-commons/gazetteer";

// Helper function to validate gazData CRS and apply defaults
const validateGazDataCrs = (gazData: GazDataConfig) => {
  const supportedCrsCodes = ["3857"];
  const crs = gazData.crs || "3857"; // Apply default if missing

  if (!supportedCrsCodes.includes(crs)) {
    console.warn(
      `Gazetteer data CRS '${crs}' is not supported. Supported CRS codes: ${supportedCrsCodes.join(
        ", "
      )}`
    );
  }

  return { ...gazData, crs };
};

// Context for outer wrapper (just config)
interface PortalContextType {
  portalConfig: PortalConfig;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

/**
 * Gating component that ensures CarmaTopicMapContext has currentMapView before rendering children
 */
const PortalGate = ({ children }: { children: React.ReactNode }) => {
  const carmaTopicMapContext = useCarmaTopicMapContext();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    console.log("[PortalGate] Checking CarmaTopicMapContext readiness:", {
      hasContext: !!carmaTopicMapContext,
      hasCurrentMapView: !!carmaTopicMapContext?.getCurrentMapView(),
      hasHomeMapView: !!carmaTopicMapContext?.getHomeMapView(),
    });

    // Check if we have both current and home map views available
    if (
      carmaTopicMapContext?.getCurrentMapView() &&
      carmaTopicMapContext?.getHomeMapView()
    ) {
      console.log("[PortalGate] CarmaTopicMapContext is ready, opening gates");
      setIsReady(true);
    }
  }, [carmaTopicMapContext]);

  if (!isReady) {
    console.log("[PortalGate] Waiting for CarmaTopicMapContext to be ready...");
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "18px",
          color: "#666",
        }}
      >
        Initializing map context...
      </div>
    );
  }

  return <>{children}</>;
};

/**
 * PortalContextProvider - Outer context for config extraction and provider orchestration
 *
 * === RESPONSIBILITIES ===
 * - Extract and validate configuration
 * - Orchestrate provider stack
 * - Pass settled state to inner PortalStateProvider
 * - Wrap children with all portal-level providers:
 *   - AuthProvider (authentication)
 *   - SandboxedEvalProvider (sandboxed evaluation)
 *   - GazDataProvider (gazetteer data)
 *   - SelectionProvider (selection state)
 *   - TransitionContextProvider (2D↔3D transitions)
 *   - CesiumContextProvider (3D scene management)
 *   - CarmaTopicMapContextProvider (topic map context)
 *   - OverlayTourProvider (overlay tours)
 *   - PortalStateProvider (inner state management)
 */

export const PortalContextProvider = ({
  children,
  config,
}: PortalProviderProps) => {
  // Apply defaults for optional configs
  const gazData = validateGazDataCrs(config.gazData || defaultGazDataConfig);

  // Stabilize topicMap config to prevent re-renders
  const topicMap = useMemo(
    () => config.topicMap || { infoBoxPixelWidth: 350 },
    [config.topicMap]
  );

  // Validate required configs
  if (!config.cesium) {
    throw new Error("Cesium config is required");
  }

  if (!config.topicMap) {
    throw new Error("Topic map config is required");
  }

  // Validate Cesium config synchronously before rendering (happens once per component lifetime)
  const validationDoneRef = useRef(false);
  if (!validationDoneRef.current) {
    validationDoneRef.current = true;
    validatePortalCesiumConfig(config.cesium, config.mapStyleMappings.cesium);
  }

  const value: PortalContextType = {
    portalConfig: config,
  };

  const overlayTransparency = config.overlay?.transparency || 0.7;
  const overlayColor = config.overlay?.color || "#000000";

  return (
    <PortalContext.Provider value={value}>
      <AuthProvider>
        <SandboxedEvalProvider>
          <GazDataProvider config={gazData}>
            {/* TODO: SelectionProvider direct access will be deprecated - use PortalContextProvider methods instead */}
            <SelectionProvider>
              <TransitionContextProvider config={config.transitions}>
                <CesiumContextProvider config={config.cesium}>
                  <CarmaTopicMapContextProvider config={topicMap}>
                    <MapLibreContextProvider>
                      <OverlayTourProvider
                        transparency={overlayTransparency}
                        color={overlayColor}
                      >
                        <HashStateProvider config={config.hashConfig}>
                          <PortalStateProvider config={config}>
                            <PortalGate>{children}</PortalGate>
                          </PortalStateProvider>
                        </HashStateProvider>
                      </OverlayTourProvider>
                    </MapLibreContextProvider>
                  </CarmaTopicMapContextProvider>
                </CesiumContextProvider>
              </TransitionContextProvider>
            </SelectionProvider>
          </GazDataProvider>
        </SandboxedEvalProvider>
      </AuthProvider>
    </PortalContext.Provider>
  );
};

export default PortalContextProvider;
