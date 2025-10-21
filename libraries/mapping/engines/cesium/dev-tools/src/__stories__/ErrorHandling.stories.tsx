import type { Meta, StoryObj } from "@storybook/react";
import { useState, useEffect } from "react";
import {
  CesiumContextProvider,
  CesiumSceneComponent,
} from "@carma-mapping/engines/cesium/core";
import { STORYBOOK_CESIUM_CONFIG } from "./core/storybook-cesium.config";

// Wrapper component for stories
function CesiumContextWrapper({ children }: { children: React.ReactNode }) {
  return (
    <CesiumContextProvider config={STORYBOOK_CESIUM_CONFIG}>
      {children}
    </CesiumContextProvider>
  );
}

// Component that handles remounting on error with limit
function ErrorHandlingScene({ maxRemounts = 5 }: { maxRemounts?: number }) {
  const [resetKey, setResetKey] = useState(0);
  const [remountCount, setRemountCount] = useState(0);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [lastError, setLastError] = useState<string>("");

  useEffect(() => {
    const handleRenderError = (ev: Event) => {
      const customEvent = ev as CustomEvent;
      const errorDetail = customEvent.detail?.error;

      console.log(
        "[ERROR-STORY] Render error detected, remount count:",
        remountCount
      );

      if (remountCount >= maxRemounts) {
        console.error(
          `[ERROR-STORY] Max remount limit (${maxRemounts}) reached. Stopping remounts.`
        );
        let errorMsg: string;
        if (errorDetail instanceof Error) {
          errorMsg = `${errorDetail.name}: ${errorDetail.message}\n\nStack:\n${errorDetail.stack}`;
        } else if (errorDetail && typeof errorDetail === "object") {
          // Avoid circular JSON error - just show type and constructor
          const objType = errorDetail.constructor?.name || "Object";
          errorMsg = `[${objType}]: ${String(errorDetail)}`;
        } else {
          errorMsg = String(errorDetail);
        }
        setLastError(errorMsg);
        setShowErrorModal(true);
        return;
      }

      console.log(
        `[ERROR-STORY] Remounting CesiumSceneComponent (${
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
    console.log(
      "[ERROR-STORY] User requested retry, resetting remount counter"
    );
    setRemountCount(0);
    setShowErrorModal(false);
    setResetKey((prev) => prev + 1);
  };

  const handleDismiss = () => {
    setShowErrorModal(false);
  };

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          padding: "12px",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          fontSize: "14px",
          fontFamily: "monospace",
        }}
      >
        <div>
          Remount Count:{" "}
          <strong>
            {remountCount}/{maxRemounts}
          </strong>
        </div>
        <div>
          Reset Key: <strong>{resetKey}</strong>
        </div>
      </div>

      <CesiumSceneComponent
        key={resetKey}
        errorHandlerOptions={{
          reloadOnRenderError: {
            enabled: false,
            remountOnly: true,
          },
        }}
      />

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
              maxWidth: "700px",
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
                fontSize: "11px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "300px",
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

// Component that deliberately triggers errors
function ManualErrorTrigger() {
  const [resetKey, setResetKey] = useState(0);

  const triggerRenderError = () => {
    console.log("[ERROR-STORY] Manually triggering render error...");
    window.dispatchEvent(
      new CustomEvent("carma:cesium:renderError", {
        detail: {
          error: new Error("Manually triggered render error for testing"),
          meta: { source: "manual-trigger" },
        },
      })
    );
  };

  const triggerUnhandledError = () => {
    console.log("[ERROR-STORY] Triggering unhandled error in next tick...");
    setTimeout(() => {
      throw new Error("Deliberately thrown unhandled error for testing");
    }, 100);
  };

  const resetComponent = () => {
    console.log("[ERROR-STORY] Resetting component...");
    setResetKey((prev) => prev + 1);
  };

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          padding: "16px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          minWidth: "250px",
        }}
      >
        <h3
          style={{ margin: "0 0 12px 0", fontSize: "16px", color: "#2d3748" }}
        >
          🧪 Error Testing Controls
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={triggerRenderError}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: "4px",
              backgroundColor: "#f56565",
              color: "white",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            Trigger Render Error
          </button>
          <button
            onClick={triggerUnhandledError}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: "4px",
              backgroundColor: "#ed8936",
              color: "white",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            Trigger Unhandled Error
          </button>
          <button
            onClick={resetComponent}
            style={{
              padding: "8px 12px",
              border: "1px solid #cbd5e0",
              borderRadius: "4px",
              backgroundColor: "white",
              color: "#4a5568",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Reset Component
          </button>
        </div>
        <div
          style={{
            marginTop: "12px",
            padding: "8px",
            backgroundColor: "#edf2f7",
            borderRadius: "4px",
            fontSize: "11px",
            color: "#4a5568",
          }}
        >
          <strong>Reset Key:</strong> {resetKey}
        </div>
      </div>

      <CesiumSceneComponent
        key={resetKey}
        errorHandlerOptions={{
          reloadOnRenderError: {
            enabled: false,
            remountOnly: true,
          },
        }}
      />
    </div>
  );
}

const meta: Meta = {
  title: "mapping\\engines\\cesium/Error Handling",
  parameters: {
    docs: {
      description: {
        component:
          "Stories demonstrating Cesium error handling, remount limiting, and error recovery mechanisms.",
      },
    },
  },
};

export default meta;

/**
 * Tests the automatic remount limiting feature.
 * The scene will attempt to remount up to 5 times before showing an error modal.
 */
export const AutomaticRemountLimiting: StoryObj = {
  render: () => (
    <CesiumContextWrapper>
      <ErrorHandlingScene maxRemounts={5} />
    </CesiumContextWrapper>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates automatic remount limiting when render errors occur. After 5 attempts, an error modal is displayed.",
      },
    },
  },
};

/**
 * Provides manual controls to trigger different types of errors.
 */
export const ManualErrorTriggers: StoryObj = {
  render: () => (
    <CesiumContextWrapper>
      <ManualErrorTrigger />
    </CesiumContextWrapper>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Provides buttons to manually trigger render errors and unhandled errors for testing error boundaries and recovery.",
      },
    },
  },
};

/**
 * Fast remount limit (2 attempts) to quickly demonstrate the modal.
 */
export const QuickFailure: StoryObj = {
  render: () => (
    <CesiumContextWrapper>
      <ErrorHandlingScene maxRemounts={2} />
    </CesiumContextWrapper>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates error modal appearing quickly with only 2 remount attempts allowed.",
      },
    },
  },
};
