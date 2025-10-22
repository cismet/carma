import type { Meta, StoryObj } from "@storybook/react";
import { useState, useEffect, useRef } from "react";
import {
  CesiumContextProvider,
  CesiumSceneComponent,
} from "@carma-mapping/engines/cesium/core";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/core";
import { BLANK_SCENE_CONFIG, STANDARD_SCENE_CONFIG } from "./configs";

// Wrapper component for stories
function CesiumContextWrapper({ children }: { children: React.ReactNode }) {
  return (
    <CesiumContextProvider config={BLANK_SCENE_CONFIG}>
      {children}
    </CesiumContextProvider>
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

type SceneType = "blank" | "standard" | "mesh" | "lod2";

type SceneInstance = {
  id: string;
  type: SceneType;
  config: CesiumConfig;
};

function getConfigForType(type: SceneType): CesiumConfig {
  switch (type) {
    case "blank":
      return BLANK_SCENE_CONFIG;
    default:
      return STANDARD_SCENE_CONFIG;
  }
}

function formatBytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function MemoryMonitor() {
  const [memory, setMemory] = useState<MemoryStats | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!(performance as any).memory) {
      setSupported(false);
      return;
    }

    const interval = setInterval(() => {
      const perfMemory = (performance as any).memory;
      if (perfMemory) {
        setMemory({
          usedJSHeapSize: perfMemory.usedJSHeapSize,
          totalJSHeapSize: perfMemory.totalJSHeapSize,
          jsHeapSizeLimit: perfMemory.jsHeapSizeLimit,
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!supported) {
    return (
      <div
        style={{
          padding: 16,
          background: "rgba(255, 200, 0, 0.95)",
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>
          ⚠️ Memory API Not Available
        </div>
        <div>
          Start Chrome with: <code>--enable-precise-memory-info</code>
        </div>
      </div>
    );
  }

  if (!memory) return null;

  const usedPercent = (
    (memory.usedJSHeapSize / memory.jsHeapSizeLimit) *
    100
  ).toFixed(1);

  return (
    <div
      style={{
        padding: 16,
        background: "rgba(255, 255, 255, 0.95)",
        borderRadius: 8,
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 12, fontSize: 14 }}>
        📊 Memory Usage
      </div>
      <div
        style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}
      >
        <div>Used Heap:</div>
        <div style={{ fontWeight: "bold" }}>
          {formatBytes(memory.usedJSHeapSize)}
        </div>

        <div>Total Heap:</div>
        <div>{formatBytes(memory.totalJSHeapSize)}</div>

        <div>Heap Limit:</div>
        <div>{formatBytes(memory.jsHeapSizeLimit)}</div>

        <div>Usage:</div>
        <div
          style={{
            fontWeight: "bold",
            color:
              parseFloat(usedPercent) > 80
                ? "#dc3545"
                : parseFloat(usedPercent) > 60
                ? "#ffc107"
                : "#28a745",
          }}
        >
          {usedPercent}%
        </div>
      </div>
    </div>
  );
}

function MemoryTestDemo() {
  const [scenes, setScenes] = useState<SceneInstance[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const nextIdRef = useRef(1);

  const addScene = (type: SceneType) => {
    const id = `scene-${nextIdRef.current++}`;
    const newScene = {
      id,
      type,
      config: getConfigForType(type),
    };
    setScenes((prev) => [...prev, newScene]);
    setActiveSceneId(id); // Bring new scene to top
  };

  const removeScene = (id: string) => {
    setScenes((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (id === activeSceneId && filtered.length > 0) {
        setActiveSceneId(filtered[filtered.length - 1].id);
      } else if (filtered.length === 0) {
        setActiveSceneId(null);
      }
      return filtered;
    });
  };

  const clearAll = () => {
    setScenes([]);
    setActiveSceneId(null);
    // Request garbage collection if available
    if (window.gc) {
      window.gc();
    }
  };

  const bringToTop = (id: string) => {
    setActiveSceneId(id);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Controls */}
      <div
        style={{
          padding: 16,
          background: "#f5f5f5",
          borderBottom: "1px solid #ddd",
          display: "flex",
          gap: 16,
          alignItems: "center",
        }}
      >
        <div style={{ marginRight: "auto" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => addScene("blank")}
              style={{
                padding: "8px 16px",
                background: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              + Blank (Globe)
            </button>
            <button
              onClick={() => addScene("mesh")}
              style={{
                padding: "8px 16px",
                background: "#007bff",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              + Mesh 2024
            </button>
            <button
              onClick={() => addScene("lod2")}
              style={{
                padding: "8px 16px",
                background: "#28a745",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              + LOD2
            </button>
          </div>
        </div>

        <div
          style={{
            fontSize: 14,
            fontFamily: "monospace",
            color: "#666",
            padding: "8px 16px",
            background: "white",
            borderRadius: 4,
            border: "1px solid #ddd",
          }}
        >
          Active scenes: <strong>{scenes.length}</strong>
        </div>

        <button
          onClick={clearAll}
          style={{
            padding: "8px 16px",
            background: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: "bold",
          }}
        >
          Clear All & GC
        </button>
      </div>

      {/* Floating Memory Monitor */}
      <div
        style={{
          position: "absolute",
          top: 90,
          right: 20,
          zIndex: 2000,
        }}
      >
        <MemoryMonitor />
      </div>

      {/* Scene Switcher */}
      {scenes.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 90,
            left: 20,
            zIndex: 2000,
            background: "rgba(255, 255, 255, 0.95)",
            borderRadius: 8,
            padding: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            maxWidth: 300,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              fontWeight: "bold",
              marginBottom: 8,
              color: "#333",
            }}
          >
            Active Scenes (click to bring to top):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {scenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => bringToTop(scene.id)}
                style={{
                  padding: "8px 12px",
                  background: scene.id === activeSceneId ? "#007bff" : "white",
                  color: scene.id === activeSceneId ? "white" : "#333",
                  border:
                    scene.id === activeSceneId ? "none" : "1px solid #ddd",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "monospace",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontWeight: scene.id === activeSceneId ? "bold" : "normal",
                }}
              >
                <span>
                  {scene.id} ({scene.type})
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeScene(scene.id);
                  }}
                  style={{
                    padding: "2px 6px",
                    background: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontSize: 11,
                    marginLeft: 8,
                  }}
                >
                  ✕
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stacked Scenes Container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          background: "#e9ecef",
          overflow: "hidden",
        }}
      >
        {scenes.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: 18,
              color: "#666",
              fontFamily: "monospace",
            }}
          >
            Click a button above to add Cesium instances
          </div>
        ) : (
          scenes.map((scene) => (
            <div
              key={scene.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: scene.id === activeSceneId ? 100 : 1,
                visibility: scene.id === activeSceneId ? "visible" : "hidden",
                background: "white",
              }}
            >
              {/* Cesium Scene */}
              <CesiumContextProvider config={scene.config}>
                <div style={{ width: "100%", height: "100%" }}>
                  <CesiumSceneComponent />
                </div>
              </CesiumContextProvider>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type Story = StoryObj;

export const MultipleInstances: Story = {
  render: () => <MemoryTestDemo />,
  parameters: {
    docs: {
      description: {
        story:
          "Test memory usage with multiple Cesium instances. Add blank, Mesh 2024, or LOD2 scenes and monitor memory consumption. Note: Requires Chrome with --enable-precise-memory-info flag for memory stats.",
      },
    },
  },
};
