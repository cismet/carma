import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// PoC: raw pannellum (vanilla JS). The official React wrapper (pannellum-react)
// only declares react@16 as a peer dependency, so we drive the library directly.
import "pannellum/build/pannellum.css";
import "pannellum";

declare global {
  interface Window {
    pannellum?: {
      viewer: (
        container: HTMLElement | string,
        config: Record<string, unknown>
      ) => { destroy: () => void };
    };
  }
}

interface PanoramaLightBoxProps {
  /** URL of an equirectangular panorama image. */
  src: string;
  title?: string;
  onClose: () => void;
}

/**
 * Fullscreen overlay that renders a 360° panorama with pannellum.
 *
 * This is a standalone PoC viewer (NOT wired into the react-cismap photo
 * lightbox). It exists to demonstrate the panorama "photobox" driven by a
 * `panorama` field coming out of the vector-style infoBoxMapping.
 */
export const PanoramaLightBox = ({
  src,
  onClose,
}: PanoramaLightBoxProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    const pannellum = window.pannellum;
    if (!el || !pannellum) return;

    const viewer = pannellum.viewer(el, {
      type: "equirectangular",
      panorama: src,
      autoLoad: true,
      // Keep the controls container so the mobile device-orientation
      // (compass/gyroscope) control stays available; only hide zoom + fullscreen.
      showZoomCtrl: false,
      showFullscreenCtrl: false,
    });

    return () => viewer.destroy();
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>,
    document.body
  );
};

export default PanoramaLightBox;
