import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// PoC: raw pannellum (vanilla JS). The official React wrapper (pannellum-react)
// only declares react@16 as a peer dependency, so we drive the library directly.
import "pannellum/build/pannellum.css";
import "pannellum";
import "./PanoramaLightBox.css";

declare global {
  interface Window {
    pannellum?: {
      viewer: (
        container: HTMLElement | string,
        config: Record<string, unknown>
      ) => {
        destroy: () => void;
        resize: () => void;
        getYaw: () => number;
        isLoaded: () => boolean;
      };
    };
  }
}

/**
 * A pannellum navigation hotspot (subset of pannellum's hotspot config). Placed
 * at a (pitch, yaw) inside the panorama; clicking it triggers clickHandlerFunc
 * (used here to jump to a neighbouring panorama — a Street-View-style tour).
 */
export interface PanoramaHotspot {
  id?: string;
  pitch: number;
  yaw: number;
  cssClass?: string;
  clickHandlerFunc?: () => void;
}

interface PanoramaLightBoxProps {
  /** URL of an equirectangular panorama image. */
  src: string;
  title?: string;
  onClose: () => void;
  /** Called with the viewer's current yaw (deg) as the user looks around. */
  onYawChange?: (yaw: number) => void;
  /** Navigation hotspots to the surrounding panoramas. */
  hotspots?: PanoramaHotspot[];
  /** Initial view yaw (deg); rotates the image so it opens facing forward. */
  initialYaw?: number;
}

// Wrap an angle (deg) into (-180, 180].
const normalizeDeg = (deg: number): number => {
  let x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
};

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
  onYawChange,
  hotspots,
  initialYaw,
}: PanoramaLightBoxProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Held in refs so changing their identity never re-inits the viewer. The
  // viewer re-inits on src change (a tour hop), which is exactly when fresh
  // hotspots / initial yaw apply, so reading the ref at init time is enough.
  const onYawChangeRef = useRef(onYawChange);
  onYawChangeRef.current = onYawChange;
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  const initialYawRef = useRef(initialYaw);
  initialYawRef.current = initialYaw;

  useEffect(() => {
    const el = containerRef.current;
    const pannellum = window.pannellum;
    if (!el || !pannellum) return;

    const initialYaw = initialYawRef.current ?? 0;

    // Each rendered hotspot's div plus the panorama yaw of its neighbour. The
    // yaw poll below rotates each arrow to keep pointing at its neighbour as the
    // user looks around (Street-View style). pannellum calls createTooltipFunc
    // with the hotspot element after applying its cssClass, which is our handle.
    const hotspotEls: Array<{ el: HTMLElement; yaw: number }> = [];
    const hotSpots = (hotspotsRef.current ?? []).map((h) => ({
      ...h,
      createTooltipFunc: (div: HTMLElement) => {
        div.style.setProperty(
          "--pano-hotspot-dir",
          `${normalizeDeg(h.yaw - initialYaw)}deg`
        );
        hotspotEls.push({ el: div, yaw: h.yaw });
      },
    }));

    const viewer = pannellum.viewer(el, {
      type: "equirectangular",
      panorama: src,
      autoLoad: true,
      // Keep the controls container so the mobile device-orientation
      // (compass/gyroscope) control stays available; only hide zoom + fullscreen.
      showZoomCtrl: false,
      showFullscreenCtrl: false,
      hotSpots,
      yaw: initialYaw,
    });

    // Pannellum has no continuous "view changed" event, so poll the yaw on each
    // frame and report changes (lets the map's selection arrow follow the view).
    let raf = 0;
    let lastYaw = NaN;
    const tick = () => {
      // Skip until loaded: before that pannellum reports yaw 0, not the
      // configured initial yaw, which would briefly flip the map arrow 180°.
      if (!viewer.isLoaded || viewer.isLoaded()) {
        const yaw = viewer.getYaw();
        if (yaw !== lastYaw) {
          lastYaw = yaw;
          onYawChangeRef.current?.(yaw);
          // Re-aim each hotspot arrow: the on-screen angle from view-centre to
          // the neighbour is its (panorama yaw − current view yaw).
          for (const hs of hotspotEls) {
            hs.el.style.setProperty(
              "--pano-hotspot-dir",
              `${normalizeDeg(hs.yaw - yaw)}deg`
            );
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      viewer.destroy();
    };
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
      <div
        ref={containerRef}
        className="carma-panorama-lightbox__viewer"
        style={{ width: "100%", height: "100%" }}
      />
    </div>,
    document.body
  );
};

export default PanoramaLightBox;
