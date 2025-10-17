import { useState, type ReactNode } from "react";
import { CesiumSceneComponent } from "../../src/lib/CesiumSceneComponent";
import { CesiumLevaControls } from "../../src/lib/components/controls/CesiumLevaControls";

interface CesiumStoryLayoutProps {
  children?: ReactNode;
  showConfigEditor?: boolean;
}

export function CesiumStoryLayout({
  children,
  showConfigEditor = false,
}: CesiumStoryLayoutProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <CesiumSceneComponent />

      {/* Leva controls with optional config editor */}
      <CesiumLevaControls
        onOpenEditor={
          showConfigEditor ? () => setIsEditorOpen(true) : undefined
        }
      />

      {/* Optional overlay content */}
      {children}

      {/* Config Editor Modal */}
      {showConfigEditor && isEditorOpen && (
        <ConfigEditorModal onClose={() => setIsEditorOpen(false)} />
      )}
    </div>
  );
}

function ConfigEditorModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1a1a",
          width: "80%",
          maxWidth: 800,
          height: "80vh",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 16,
            background: "#333",
            color: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>Config Editor</h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              fontSize: 24,
              cursor: "pointer",
              padding: 0,
              width: 32,
              height: 32,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
          <p style={{ color: "#999", margin: "0 0 16px 0" }}>
            Config editor coming soon - will allow live editing of Cesium
            configuration
          </p>
        </div>
      </div>
    </div>
  );
}
