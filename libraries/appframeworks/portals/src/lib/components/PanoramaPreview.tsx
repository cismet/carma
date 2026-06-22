import { useEffect, useRef, useState } from "react";

import "pannellum/build/pannellum.css";
import "pannellum";
import "./PanoramaPreview.css";

interface PanoramaPreviewProps {
  /** URL of an equirectangular panorama image. */
  src: string;
  /** Called when the user clicks the expand control (open fullscreen). */
  onExpand?: () => void;
  /** Called with the viewer's current yaw (deg) as the user looks around. */
  onYawChange?: (yaw: number) => void;
}

/**
 * Desktop: fixed thumbnail. Mobile (infobox goes full width): fill the row.
 *
 * The infobox places each secondary element in a shrink-to-fit, right-aligned
 * cell, so a percentage width collapses the cell to ~zero. We must set an
 * explicit pixel width.
 */
const getPreviewWidth = () =>
  typeof window !== "undefined" && window.innerWidth <= 700
    ? window.innerWidth - 16
    : 250;

const PREVIEW_HEIGHT = 160;

/**
 * Small inline, draggable 360° preview rendered in the infobox. Drag to peek;
 * the expand control opens the fullscreen PanoramaLightBox.
 */
export const PanoramaPreview = ({
  src,
  onExpand,
  onYawChange,
}: PanoramaPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{
    destroy: () => void;
    resize: () => void;
    getYaw: () => number;
  } | null>(null);
  const [width, setWidth] = useState<number>(getPreviewWidth);
  // Held in a ref so changing the callback identity never re-inits the viewer.
  const onYawChangeRef = useRef(onYawChange);
  onYawChangeRef.current = onYawChange;

  useEffect(() => {
    const onResize = () => setWidth(getPreviewWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Init the viewer once per panorama. Re-initialising on width changes would
  // reload the image; instead we refit the existing viewer below.
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
    viewerRef.current = viewer;

    // Pannellum has no continuous "view changed" event, so poll the yaw on each
    // frame and report changes (lets the map's selection arrow follow the view).
    let raf = 0;
    let lastYaw = NaN;
    const tick = () => {
      const yaw = viewer.getYaw();
      if (yaw !== lastYaw) {
        lastYaw = yaw;
        onYawChangeRef.current?.(yaw);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [src]);

  // Refit the already-loaded viewer to the new container width (no reload).
  useEffect(() => {
    viewerRef.current?.resize();
  }, [width]);

  return (
    <div
      className="carma-panorama-preview"
      style={{ width, height: PREVIEW_HEIGHT }}
    >
      <div ref={containerRef} className="carma-panorama-preview__viewer" />
      {onExpand && (
        <button
          type="button"
          aria-label="Panorama im Vollbild öffnen"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          className="carma-panorama-preview__expand"
        >
          ⤢
        </button>
      )}
    </div>
  );
};

export default PanoramaPreview;
