import type { Meta, StoryObj } from "@storybook/react";
import { useState, useEffect } from "react";
import {
  CesiumContextProvider,
  CesiumSceneComponent,
} from "@carma-mapping/engines/cesium/core";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/core";
import { CesiumLevaControls } from "@carma-mapping/engines/cesium/dev-tools";
import { STANDARD_SCENE_CONFIG, BLANK_SCENE_CONFIG } from "./configs";
import { useControls } from "leva";

// Config options for Leva
type ConfigType = "standard" | "blank";

function getConfigForType(type: ConfigType): CesiumConfig {
  switch (type) {
    case "standard":
      return STANDARD_SCENE_CONFIG;
    case "blank":
      return BLANK_SCENE_CONFIG;
    default:
      return STANDARD_SCENE_CONFIG;
  }
}

// Wrapper component for stories with config switching
function CesiumContextWrapper({ children }: { children: React.ReactNode }) {
  const { configType } = useControls("Settings", {
    configType: {
      value: "standard" as ConfigType,
      options: {
        "Standard (Mesh + LOD2)": "standard",
        "Mesh Only": "mesh",
        "LOD2 Only": "lod2",
        "Blank Globe": "blank",
      },
      label: "Scene Config",
    },
  });

  const [config, setConfig] = useState<CesiumConfig>(
    getConfigForType(configType as ConfigType)
  );
  const [resetKey, setResetKey] = useState(0);

  // Remount context provider when config type changes
  useEffect(() => {
    setConfig(getConfigForType(configType as ConfigType));
    setResetKey((prev) => prev + 1);
  }, [configType]);

  return (
    <CesiumContextProvider key={resetKey} config={config}>
      {children}
    </CesiumContextProvider>
  );
}

// Component that handles remounting on error with limit
function RemountableScene({ maxRemounts = 5 }: { maxRemounts?: number }) {
  const [resetKey, setResetKey] = useState(0);
  const [remountCount, setRemountCount] = useState(0);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [lastError, setLastError] = useState<string>("");

  useEffect(() => {
    const handleRenderError = (ev: Event) => {
      const customEvent = ev as CustomEvent;
      const errorDetail = customEvent.detail?.error;

      // Check if this is the Cesium Scene-object bug (not a real error)
      // Scene objects have specific properties like 'primitives', 'camera', 'globe'
      const isSceneObjectBug =
        errorDetail &&
        typeof errorDetail === "object" &&
        !("message" in errorDetail) && // Not an Error object
        ("primitives" in errorDetail ||
          "camera" in errorDetail ||
          "globe" in errorDetail);

      if (isSceneObjectBug) {
        console.warn(
          "[STORY] Cesium Scene-object bug detected - this is a false positive render error. Ignoring."
        );
        console.debug(
          "[STORY] Scene object properties:",
          Object.keys(errorDetail).slice(0, 10)
        );
        // Don't remount for this false positive
        return;
      }

      console.log(
        "[STORY] Render error detected, remount count:",
        remountCount
      );

      if (remountCount >= maxRemounts) {
        console.error(
          `[STORY] Max remount limit (${maxRemounts}) reached. Stopping remounts.`
        );
        const errorMsg =
          errorDetail instanceof Error
            ? errorDetail.message
            : typeof errorDetail === "object"
            ? JSON.stringify(errorDetail, null, 2)
            : String(errorDetail);
        setLastError(errorMsg);
        setShowErrorModal(true);
        return;
      }

      console.log(
        `[STORY] Remounting CesiumSceneComponent (${
          remountCount + 1
        }/${maxRemounts})...`
      );
      setRemountCount((prev) => prev + 1);
      setResetKey((prev) => prev + 1);
    };

    window.addEventListener("carma:cesium:renderError", handleRenderError);
    return () =>
      window.removeEventListener("carma:cesium:renderError", handleRenderError);
  }, [remountCount, maxRemounts]);

  const handleRetry = () => {
    console.log("[STORY] User requested retry, resetting remount counter");
    setRemountCount(0);
    setShowErrorModal(false);
    setResetKey((prev) => prev + 1);
  };

  const handleDismiss = () => {
    setShowErrorModal(false);
  };

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <CesiumSceneComponent
        key={resetKey}
        errorHandlerOptions={{
          reloadOnRenderError: {
            enabled: false,
            remountOnly: true,
          },
        }}
      />
      <CesiumLevaControls />

      {showErrorModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "600px",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h2 style={{ marginTop: 0, color: "#e53e3e" }}>
              ⚠️ Cesium Render Error
            </h2>
            <p style={{ marginBottom: "16px" }}>
              The Cesium viewer encountered a persistent render error and
              reached the maximum remount limit of{" "}
              <strong>{maxRemounts}</strong> attempts.
            </p>
            <div
              style={{
                backgroundColor: "#f7fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
                padding: "12px",
                marginBottom: "16px",
                fontFamily: "monospace",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "200px",
                overflow: "auto",
              }}
            >
              {lastError || "Unknown error"}
            </div>
            <p
              style={{
                fontSize: "14px",
                color: "#718096",
                marginBottom: "20px",
              }}
            >
              This usually indicates a configuration issue or missing Cesium
              assets. Check the browser console for detailed error messages.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleDismiss}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #cbd5e0",
                  borderRadius: "4px",
                  backgroundColor: "white",
                  color: "#4a5568",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleRetry}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: "#3182ce",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const meta: Meta = {
  title: "mapping\\engines\\cesium/core",
  decorators: [
    (Story) => (
      <CesiumContextWrapper>
        <Story />
      </CesiumContextWrapper>
    ),
  ],
};

export default meta;

export const SingleInstanceScene: StoryObj = {
  render: () => <RemountableScene />,
};
