import { useEffect, useRef } from "react";

import "pannellum/build/pannellum.css";
import "pannellum";

interface PanoramaPreviewProps {
  /** URL of an equirectangular panorama image. */
  src: string;
  width?: number;
  height?: number;
  /** Called when the user clicks the expand control (open fullscreen). */
  onExpand?: () => void;
}

/**
 * Small inline, draggable 360° preview rendered in the infobox, mirroring the
 * flat-photo thumbnail. Drag to peek around; the expand control opens the
 * fullscreen PanoramaLightBox. PoC: raw pannellum.
 */
export const PanoramaPreview = ({
  src,
  width = 250,
  height = 160,
  onExpand,
}: PanoramaPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    const pannellum = window.pannellum;
    if (!el || !pannellum) return;

    const viewer = pannellum.viewer(el, {
      type: "equirectangular",
      panorama: src,
      autoLoad: true,
      showControls: false,
      showFullscreenCtrl: false,
      showZoomCtrl: false,
      keyboardZoom: false,
      mouseZoom: false,
      compass: false,
      draggable: true,
    });

    return () => viewer.destroy();
  }, [src]);

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        marginLeft: "auto",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div ref={containerRef} style={{ width, height }} />
      {onExpand && (
        <button
          type="button"
          aria-label="Panorama im Vollbild öffnen"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 2,
            width: 26,
            height: 26,
            borderRadius: 4,
            border: "none",
            background: "rgba(0,0,0,0.55)",
            color: "white",
            fontSize: 14,
            lineHeight: "26px",
            cursor: "pointer",
          }}
        >
          ⤢
        </button>
      )}
    </div>
  );
};

export default PanoramaPreview;
