import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { resolvePanoramaScene, type PannellumViewer } from "./panoramaScene";

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
      ) => PannellumViewer;
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
  /** URL of an equirectangular panorama image (fallback when no multires). */
  src: string;
  /** URL of a pannellum multiresolution config.json; preferred over `src`. */
  multiResConfigUrl?: string;
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
  multiResConfigUrl,
  onClose,
  onYawChange,
  hotspots,
  initialYaw,
}: PanoramaLightBoxProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Held in refs so changing their identity never re-runs the init effect.
  // onYawChange is read live each frame; hotspots / initialYaw are read when a
  // scene is (re)built on a hop.
  const onYawChangeRef = useRef(onYawChange);
  onYawChangeRef.current = onYawChange;
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  const initialYawRef = useRef(initialYaw);
  initialYawRef.current = initialYaw;

  // The one reused pannellum viewer (created for the first scene, destroyed on
  // unmount), the yaw-poll rAF handle, a monotonic scene-id counter, and the
  // current scene's hotspot elements — swapped on each hop so the poll re-aims
  // whatever is on screen.
  const viewerRef = useRef<PannellumViewer | null>(null);
  const rafRef = useRef(0);
  const sceneSeqRef = useRef(0);
  const hotspotElsRef = useRef<Array<{ el: HTMLElement; yaw: number }>>([]);

  // Create the pannellum viewer once and reuse it across tour hops: a hop adds
  // the new pano as a scene and crossfades to it (loadScene) instead of tearing
  // down the WebGL context and re-decoding from scratch. The fade also masks the
  // decode. The viewer is destroyed only on unmount (effect below).
  useEffect(() => {
    const el = containerRef.current;
    const pannellum = window.pannellum;
    if (!el || !pannellum) return;

    const initialYaw = initialYawRef.current ?? 0;

    // Build this scene's hotspots. pannellum calls createTooltipFunc with each
    // hotspot element after applying its cssClass, which is our handle: stamp
    // the initial aim and collect the elements so the yaw poll can re-aim them.
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

    // Scene resolution is async (a multires config is fetched); guard against
    // the effect being cleaned up (hop / unmount) before it resolves.
    let cancelled = false;

    resolvePanoramaScene(src, multiResConfigUrl).then((scene) => {
      if (cancelled) return;
      const sceneId = `pano-${sceneSeqRef.current++}`;
      const sceneConfig = { ...scene, hotSpots, yaw: initialYaw };
      // Swap in this scene's hotspot list so the running poll re-aims it.
      hotspotElsRef.current = hotspotEls;

      if (viewerRef.current) {
        // Reuse: register the new pano and crossfade to it (open facing
        // forward, level). loadScene no-ops until the first scene has loaded,
        // which it has by the time the user can click a hotspot.
        viewerRef.current.addScene(sceneId, sceneConfig);
        viewerRef.current.loadScene(sceneId, 0, initialYaw);
        return;
      }

      // First scene: init in tour mode (default + scenes) so loadScene works.
      viewerRef.current = pannellum.viewer(el, {
        default: {
          firstScene: sceneId,
          sceneFadeDuration: 500,
          autoLoad: true,
          // Keep the controls container so the mobile device-orientation
          // (compass/gyroscope) control stays available; only hide zoom +
          // fullscreen.
          showZoomCtrl: false,
          showFullscreenCtrl: false,
        },
        scenes: { [sceneId]: sceneConfig },
      });

      // Pannellum has no continuous "view changed" event, so poll the yaw each
      // frame: report it (the map arrow follows) and re-aim the current scene's
      // hotspots. The poll runs for the viewer's whole life, across scene loads.
      let lastYaw = NaN;
      const tick = () => {
        const viewer = viewerRef.current;
        // Skip until loaded: before that pannellum reports yaw 0, not the
        // configured initial yaw, which would briefly flip the map arrow 180°.
        if (viewer && (!viewer.isLoaded || viewer.isLoaded())) {
          const yaw = viewer.getYaw();
          if (yaw !== lastYaw) {
            lastYaw = yaw;
            onYawChangeRef.current?.(yaw);
            // On-screen angle from view-centre to each neighbour is its
            // (panorama yaw − current view yaw).
            for (const hs of hotspotElsRef.current) {
              hs.el.style.setProperty(
                "--pano-hotspot-dir",
                `${normalizeDeg(hs.yaw - yaw)}deg`
              );
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    });

    // No destroy here: a hop only cancels the pending async apply; the viewer
    // persists and is reused. Teardown happens on unmount (effect below).
    return () => {
      cancelled = true;
    };
  }, [src, multiResConfigUrl]);

  // Destroy the reused viewer and stop the yaw poll on unmount only.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

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
