import { createPortal } from "react-dom";

import { PanoramaViewer, type PanoramaViewerProps } from "./PanoramaViewer";

// Re-export so existing consumers of `@carma-appframeworks/portals` keep
// importing PanoramaHotspot from here.
export type { PanoramaHotspot } from "./PanoramaViewer";

interface PanoramaLightBoxProps
  extends Omit<PanoramaViewerProps, "onEscape"> {
  title?: string;
  onClose: () => void;
}

/**
 * Standalone fullscreen overlay that renders a 360° panorama with pannellum.
 *
 * Thin wrapper: it provides the fullscreen chrome (dark backdrop + close
 * button) and embeds the reusable {@link PanoramaViewer} for the actual
 * rendering and Street-View interaction. The same viewer is also embedded as a
 * slide inside the media lightbox, which supplies its own chrome instead.
 */
export const PanoramaLightBox = ({
  onClose,
  ...viewerProps
}: PanoramaLightBoxProps) => {
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,0.92)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          zIndex: 100001,
          width: 40,
          height: 40,
          borderRadius: 20,
          border: "none",
          background: "rgba(255,255,255,0.85)",
          fontSize: 22,
          lineHeight: "40px",
          cursor: "pointer",
        }}
      >
        ×
      </button>
      <PanoramaViewer {...viewerProps} onEscape={onClose} />
    </div>,
    document.body
  );
};

export default PanoramaLightBox;
