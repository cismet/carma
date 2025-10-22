import type { Meta, StoryObj } from "@storybook/react";
import { useControls, button, folder } from "leva";
import {
  CesiumContextProvider,
  CesiumSceneComponent,
  CesiumErrorIndicator,
} from "@carma-mapping/engines/cesium/core";
import { STORYBOOK_CESIUM_CONFIG } from "./core/configs";

function ErrorIndicatorTestScene() {
  useControls({
    "Error Triggers": folder({
      "Trigger Render Error": button(() => {
        console.log("[TEST] Triggering carma:cesium:renderError event");
        window.dispatchEvent(
          new CustomEvent("carma:cesium:renderError", {
            detail: {
              error: new Error("Test render error from Leva controls"),
              meta: { source: "leva-controls", timestamp: Date.now() },
            },
          })
        );
      }),
      "Trigger React Error": button(() => {
        console.log("[TEST] Triggering React component error");
        // This will throw in the next render cycle
        setTimeout(() => {
          throw new Error("Test React error from Leva controls");
        }, 0);
      }),
      "Trigger WebGL Context Lost": button(() => {
        console.log("[TEST] Simulating WebGL context lost");
        const canvas = document.querySelector("canvas");
        if (canvas) {
          const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
          if (gl) {
            const ext = gl.getExtension("WEBGL_lose_context");
            if (ext) {
              ext.loseContext();
              console.log("[TEST] WebGL context lost triggered");
            } else {
              console.warn("[TEST] WEBGL_lose_context extension not available");
            }
          }
        }
      }),
      "Trigger Cesium API Error": button(() => {
        console.log("[TEST] Triggering Cesium API error");
        window.dispatchEvent(
          new CustomEvent("carma:cesium:renderError", {
            detail: {
              error: new Error(
                "RuntimeError: Failed to load tileset - simulated Cesium API error"
              ),
              meta: {
                source: "cesium-api",
                type: "RuntimeError",
                timestamp: Date.now(),
              },
            },
          })
        );
      }),
      "Multiple Errors": button(() => {
        console.log("[TEST] Triggering multiple errors");
        for (let i = 1; i <= 3; i++) {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("carma:cesium:renderError", {
                detail: {
                  error: new Error(`Test error #${i} of 3`),
                  meta: { iteration: i, total: 3 },
                },
              })
            );
          }, i * 500);
        }
      }),
    }),
    "Clear Errors": button(() => {
      console.log("[TEST] Reloading page to clear errors");
      window.location.reload();
    }),
  });

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <CesiumSceneComponent />
      <CesiumErrorIndicator />

      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          padding: "12px 16px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          fontSize: "13px",
          maxWidth: "400px",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8, color: "#2d3748" }}>
          💡 Testing Instructions
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#4a5568" }}>
          <li>
            Use Leva controls (top-right) to trigger different error types
          </li>
          <li>Watch for yellow error indicator in top-right corner</li>
          <li>Click indicator to see error details modal</li>
          <li>Multiple errors will increment the counter</li>
        </ul>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "mapping\\engines\\cesium/CesiumErrorIndicator",
  parameters: {
    docs: {
      description: {
        component:
          "Interactive testing for CesiumErrorIndicator component. Use Leva controls to trigger various error types and observe the error indicator behavior.",
      },
    },
  },
};

export default meta;

/**
 * Interactive error indicator testing with Leva controls.
 * Trigger different error types and observe the error indicator's behavior.
 */
export const InteractiveTesting: StoryObj = {
  render: () => (
    <CesiumContextProvider config={STORYBOOK_CESIUM_CONFIG}>
      <ErrorIndicatorTestScene />
    </CesiumContextProvider>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Use the Leva controls panel to trigger different types of errors:\n\n" +
          "- **Render Error**: Standard Cesium render error\n" +
          "- **React Error**: Error in React component lifecycle\n" +
          "- **WebGL Context Lost**: Simulates GPU/driver issues\n" +
          "- **Cesium API Error**: Simulates Cesium library errors\n" +
          "- **Multiple Errors**: Triggers 3 errors in sequence\n\n" +
          "The error indicator appears in the top-right corner showing error count and time.",
      },
    },
  },
};
