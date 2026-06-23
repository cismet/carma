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
  /** Horizontal distance to the neighbour (m); drives the ground-decal scale. */
  distanceM?: number;
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
  /** Arrow Up: navigate to the next position (the parent decides which). */
  onNext?: () => void;
  /** Arrow Down: navigate to the previous position (the parent decides which). */
  onPrevious?: () => void;
  /** Navigation hotspots to the surrounding panoramas. */
  hotspots?: PanoramaHotspot[];
  /** Initial view yaw (deg); rotates the image so it opens facing forward. */
  initialYaw?: number;
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
  multiResConfigUrl,
  onClose,
  onYawChange,
  onNext,
  onPrevious,
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
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const onPreviousRef = useRef(onPrevious);
  onPreviousRef.current = onPrevious;

  // The one reused pannellum viewer (created for the first scene, destroyed on
  // unmount), the yaw-poll rAF handle, a monotonic scene-id counter, and the
  // current scene's hotspot elements — swapped on each hop so the poll re-aims
  // whatever is on screen.
  const viewerRef = useRef<PannellumViewer | null>(null);
  const rafRef = useRef(0);
  const sceneSeqRef = useRef(0);
  const hotspotElsRef = useRef<
    Array<{ el: HTMLElement; yaw: number; navigate?: () => void }>
  >([]);

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
    // hotspot element after applying its cssClass, which is our handle: collect
    // the elements (and their navigate fn) so the viewer-level mouse handlers
    // can find the cross nearest the cursor. We deliberately DON'T pass
    // clickHandlerFunc to pannellum — navigation is driven from a viewer-level
    // click that jumps to the nearest cross, so a per-element click would
    // double-fire.
    const hotspotEls: Array<{
      el: HTMLElement;
      yaw: number;
      navigate?: () => void;
    }> = [];
    const hotSpots = (hotspotsRef.current ?? []).map((h) => {
      const { clickHandlerFunc, ...rest } = h;
      return {
        ...rest,
        createTooltipFunc: (div: HTMLElement) => {
          // Lay the ring on the road: a flat decal's foreshortening depends only
          // on its depression below horizontal (= its pitch), so tilt = 90−|pitch|
          // is correct regardless of where the user looks. Scale by distance so
          // nearer panos read as larger (the perspective cue pannellum's
          // fixed-size hotspots lack).
          const tilt = Math.max(25, Math.min(86, 90 - Math.abs(h.pitch)));
          const scale = Math.max(0.45, Math.min(1.5, 6 / (h.distanceM ?? 6)));
          div.style.setProperty("--pano-cross-tilt", `${tilt}deg`);
          div.style.setProperty("--pano-cross-scale", `${scale}`);
          hotspotEls.push({ el: div, yaw: h.yaw, navigate: clickHandlerFunc });
        },
      };
    });

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
          // Free the arrow keys (pannellum pans with them by default) so they
          // can drive tour navigation instead. Dragging still pans the view.
          disableKeyboardCtrl: true,
        },
        scenes: { [sceneId]: sceneConfig },
      });

      // Pannellum has no continuous "view changed" event, so poll the yaw each
      // frame and report it (the map arrow follows). The poll runs for the
      // viewer's whole life, across scene loads.
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
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onNextRef.current?.();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onPreviousRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Street-View interaction: a click ANYWHERE jumps to the cross nearest the
  // cursor (not just a direct hit), and hover always highlights that same
  // nearest cross so the preview matches the jump.
  //
  // Listeners run in the CAPTURE phase: pannellum binds drag handlers on its
  // canvas and swallows mousedown there, so a bubble-phase listener would only
  // see presses that land on a cross div (above the canvas) — which is exactly
  // why a click used to need a dead-on hit. Capturing means we always see the
  // press, wherever it lands.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const DRAG_PX = 6; // moved more than this since mousedown => a pan, not a click
    const down = { x: 0, y: 0 };

    // Nearest on-screen cross to a client point (or null). Only crosses whose
    // centre is inside the viewer rect count, which drops ones behind you that
    // pannellum may park at the edges.
    const nearestTo = (x: number, y: number) => {
      const bounds = el.getBoundingClientRect();
      let best: { el: HTMLElement; navigate?: () => void; dist: number } | null =
        null;
      for (const entry of hotspotElsRef.current) {
        const r = entry.el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (
          cx < bounds.left ||
          cx > bounds.right ||
          cy < bounds.top ||
          cy > bounds.bottom
        ) {
          continue;
        }
        const dist = Math.hypot(x - cx, y - cy);
        if (!best || dist < best.dist) {
          best = { el: entry.el, navigate: entry.navigate, dist };
        }
      }
      return best;
    };

    const highlight = (target: HTMLElement | null) => {
      for (const entry of hotspotElsRef.current) {
        entry.el.classList.toggle("is-hover", entry.el === target);
      }
    };

    const onMove = (e: MouseEvent) => {
      const best = nearestTo(e.clientX, e.clientY);
      highlight(best ? best.el : null);
    };
    const onLeave = () => highlight(null);
    const onDown = (e: MouseEvent) => {
      down.x = e.clientX;
      down.y = e.clientY;
    };
    const onClick = (e: MouseEvent) => {
      // Ignore the click that ends a drag-to-pan.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX) return;
      const best = nearestTo(e.clientX, e.clientY);
      best?.navigate?.();
    };

    el.addEventListener("mousemove", onMove, true);
    el.addEventListener("mouseleave", onLeave, true);
    el.addEventListener("mousedown", onDown, true);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("mousemove", onMove, true);
      el.removeEventListener("mouseleave", onLeave, true);
      el.removeEventListener("mousedown", onDown, true);
      el.removeEventListener("click", onClick, true);
    };
  }, []);

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
