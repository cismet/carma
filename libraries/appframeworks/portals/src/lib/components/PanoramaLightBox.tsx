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
  /**
   * Viewer yaw (deg) of the neighbour's own street direction (from its heading),
   * pointing toward the neighbour. Aims the cursor arrow along the street, which
   * differs from the bearing to the neighbour at a junction.
   */
  streetYaw?: number;
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

// Project a world direction (vx,vy,vz; x right, y up, z forward at yaw 0) to a
// pixel in the viewer, given the current view (yaw0, pitch0, hfov) and viewport
// size. pannellum renders a rectilinear (pinhole) view, so this is a standard
// perspective projection; the screen position depends only on direction, so it
// projects both sphere points (a cross) and points-at-infinity (a vanishing
// point). Returns null when the direction is behind the camera.
const projectVec = (
  vx: number,
  vy: number,
  vz: number,
  yaw0Deg: number,
  pitch0Deg: number,
  hfovDeg: number,
  w: number,
  h: number
): { x: number; y: number } | null => {
  const d2r = Math.PI / 180;
  const yaw0 = yaw0Deg * d2r;
  const pitch0 = pitch0Deg * d2r;
  const F = [
    Math.sin(yaw0) * Math.cos(pitch0),
    Math.sin(pitch0),
    Math.cos(yaw0) * Math.cos(pitch0),
  ];
  const R = [Math.cos(yaw0), 0, -Math.sin(yaw0)]; // horizontal right
  const U = [
    F[1] * R[2] - F[2] * R[1],
    F[2] * R[0] - F[0] * R[2],
    F[0] * R[1] - F[1] * R[0],
  ]; // up = F x R
  const xc = vx * R[0] + vy * R[1] + vz * R[2];
  const yc = vx * U[0] + vy * U[1] + vz * U[2];
  const zc = vx * F[0] + vy * F[1] + vz * F[2];
  if (zc <= 0.001) return null; // behind the camera
  const f = w / 2 / Math.tan((hfovDeg * d2r) / 2);
  return { x: w / 2 + (f * xc) / zc, y: h / 2 - (f * yc) / zc };
};

// Unit direction for a (yaw, pitch) in degrees.
const dirFromYawPitch = (
  yawDeg: number,
  pitchDeg: number
): [number, number, number] => {
  const d2r = Math.PI / 180;
  const yaw = yawDeg * d2r;
  const pitch = pitchDeg * d2r;
  return [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
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
  onNext,
  onPrevious,
  hotspots,
  initialYaw,
}: PanoramaLightBoxProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // The Street-View-style arrow that follows the cursor on the ground.
  const cursorArrowRef = useRef<HTMLDivElement>(null);
  // A DOM "back" arrow that replaces the native cursor over the go-back zone.
  // (An SVG image cursor renders blank in Chrome, so we draw our own and hide
  // the real cursor there — same approach as the ground cursor arrow above.)
  const backCursorRef = useRef<HTMLDivElement>(null);
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
  // When true, the next hop resets the view to the forward (initial) yaw; set
  // only when a cross dot is clicked directly. Otherwise a hop keeps the user's
  // current view direction (the yaw frame is street-relative, so e.g. a sidewalk
  // stays in view from pano to pano).
  const resetViewOnNextHopRef = useRef(false);
  const hotspotElsRef = useRef<
    Array<{
      el: HTMLElement;
      yaw: number;
      pitch: number;
      streetYaw?: number;
      navigate?: () => void;
    }>
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
      pitch: number;
      streetYaw?: number;
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
          hotspotEls.push({
            el: div,
            yaw: h.yaw,
            pitch: h.pitch,
            streetYaw: h.streetYaw,
            navigate: clickHandlerFunc,
          });
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
        // Reuse: register the new pano and crossfade to it. Keep the user's
        // current view direction across the hop (so they can follow e.g. a
        // sidewalk from pano to pano); only a direct click on a cross dot resets
        // the view to the forward (initial) yaw and level pitch. loadScene
        // no-ops until the first scene has loaded, which it has by the time the
        // user can navigate.
        const reset = resetViewOnNextHopRef.current;
        resetViewOnNextHopRef.current = false;
        const hopYaw = reset ? initialYaw : viewerRef.current.getYaw();
        const hopPitch = reset ? 0 : viewerRef.current.getPitch();
        viewerRef.current.addScene(sceneId, sceneConfig);
        viewerRef.current.loadScene(sceneId, hopPitch, hopYaw);
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

    type Entry = (typeof hotspotElsRef.current)[number];

    // Nearest on-screen cross to a client point (or null). Only crosses whose
    // centre is inside the viewer rect count, which drops ones behind you that
    // pannellum may park at the edges.
    const nearestTo = (x: number, y: number): { entry: Entry; dist: number } | null => {
      const bounds = el.getBoundingClientRect();
      let best: { entry: Entry; dist: number } | null = null;
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
        if (!best || dist < best.dist) best = { entry, dist };
      }
      return best;
    };

    const highlight = (target: HTMLElement | null) => {
      for (const entry of hotspotElsRef.current) {
        entry.el.classList.toggle("is-hover", entry.el === target);
      }
    };

    const hideArrow = () => {
      if (cursorArrowRef.current) cursorArrowRef.current.style.opacity = "0";
    };

    // The cursor arrow follows the mouse but is oriented by the TRAVEL direction
    // (current pano -> target node), not the cursor: that direction is the
    // target's street, whose on-screen slope is the line from the target cross
    // up to its vanishing point on the horizon (same azimuth, pitch 0). So the
    // arrow points "down the street toward where you'd jump" wherever the cursor
    // sits. It is foreshortened by the cursor's ground pitch, and hidden above
    // the horizon (no street there).
    const updateArrow = (e: MouseEvent, target: Entry | null) => {
      const arrow = cursorArrowRef.current;
      if (!arrow) return;
      const viewer = viewerRef.current;
      if (!target || !viewer) {
        arrow.style.opacity = "0";
        return;
      }

      let cursorPitch = -30; // assume ground if pannellum can't tell us
      if (typeof viewer.mouseEventToCoords === "function") {
        try {
          const coords = viewer.mouseEventToCoords(e);
          if (coords) cursorPitch = coords[0];
        } catch {
          // ignore — keep the ground assumption
        }
      }
      if (cursorPitch > -1) {
        arrow.style.opacity = "0"; // pointing at sky / buildings, not the road
        return;
      }

      const bounds = el.getBoundingClientRect();
      const yaw0 = viewer.getYaw();
      const pitch0 = viewer.getPitch();
      const hfov = viewer.getHfov();
      const w = bounds.width;
      const h = bounds.height;
      // The street is a straight ground line through the target along its own
      // heading; in a pinhole view it projects to a straight screen line through
      // the target cross and the street's vanishing point. So aim the arrow from
      // the cross toward that vanishing direction.
      const nearDir = dirFromYawPitch(target.yaw, target.pitch);
      const near = projectVec(...nearDir, yaw0, pitch0, hfov, w, h);
      const streetYaw = target.streetYaw ?? target.yaw;
      const sr = (streetYaw * Math.PI) / 180;
      // Horizontal direction of the street (a point at infinity along it).
      let vanish = projectVec(Math.sin(sr), 0, Math.cos(sr), yaw0, pitch0, hfov, w, h);
      let flip = false;
      if (!vanish) {
        // forward vanishing point is behind the camera: use the opposite end of
        // the same street line and flip the arrow back to the travel sense.
        vanish = projectVec(-Math.sin(sr), 0, -Math.cos(sr), yaw0, pitch0, hfov, w, h);
        flip = true;
      }
      if (!near || !vanish) {
        arrow.style.opacity = "0";
        return;
      }
      let theta =
        (Math.atan2(vanish.y - near.y, vanish.x - near.x) * 180) / Math.PI;
      if (flip) theta += 180;
      // Flatter near the horizon (small |pitch| = far away), rounder when the
      // cursor is low and near.
      const k = Math.max(
        0.3,
        Math.min(0.85, Math.sin((Math.abs(cursorPitch) * Math.PI) / 180))
      );
      arrow.style.left = `${e.clientX}px`;
      arrow.style.top = `${e.clientY}px`;
      arrow.style.transform = `scaleY(${k}) rotate(${theta}deg)`;
      arrow.style.opacity = "0.4";
    };

    const onMove = (e: MouseEvent) => {
      const best = nearestTo(e.clientX, e.clientY);
      highlight(best ? best.entry.el : null);
      updateArrow(e, best ? best.entry : null);
    };
    const onLeave = () => {
      highlight(null);
      hideArrow();
    };
    const onDown = (e: MouseEvent) => {
      down.x = e.clientX;
      down.y = e.clientY;
    };
    const onClick = (e: MouseEvent) => {
      // Ignore the click that ends a drag-to-pan.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX) return;
      const best = nearestTo(e.clientX, e.clientY);
      if (!best) return;
      // A direct click on a cross dot resets the next pano to the forward view;
      // clicking elsewhere (which still jumps to the nearest dot) keeps the
      // current view direction.
      const target = e.target as Node | null;
      resetViewOnNextHopRef.current = hotspotElsRef.current.some(
        (h) => !!target && h.el.contains(target)
      );
      best.entry.navigate?.();
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
      {onPrevious && (
        // "Go back" hit zone pinned to the bottom centre (over the survey
        // vehicle, where the road behind you is): the pano behind you is
        // otherwise only reachable with the ArrowDown key or by panning 180°.
        // The zone itself is invisible; the only feedback is the native cursor
        // being replaced by a downward "back" arrow (backCursorRef) while you
        // hover it. Clicking mirrors ArrowDown (onPrevious). It sits outside the
        // viewer container, so its click never reaches the viewer-level capture
        // handlers (no double navigation).
        <>
          <button
            type="button"
            onClick={() => onPreviousRef.current?.()}
            onMouseEnter={(e) => {
              const c = backCursorRef.current;
              if (!c) return;
              c.style.left = `${e.clientX}px`;
              c.style.top = `${e.clientY}px`;
              c.style.opacity = "0.4";
            }}
            onMouseMove={(e) => {
              const c = backCursorRef.current;
              if (!c) return;
              c.style.left = `${e.clientX}px`;
              c.style.top = `${e.clientY}px`;
            }}
            onMouseLeave={() => {
              const c = backCursorRef.current;
              if (c) c.style.opacity = "0";
            }}
            aria-label="Zurück zur vorherigen Position"
            className="carma-pano-back-btn"
          />
          <div
            ref={backCursorRef}
            className="carma-pano-back-cursor"
            aria-hidden="true"
          >
            <svg viewBox="0 0 32 32">
              {/* Same chevron as the ground cursor arrow, pointing down (back). */}
              <path
                d="M6 12 L16 22 L26 12"
                fill="none"
                stroke="#ffffff"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </>
      )}
      <div
        ref={cursorArrowRef}
        className="carma-pano-cursor-arrow"
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 32">
          <path
            d="M11 6 L23 16 L11 26"
            fill="none"
            stroke="#ffffff"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>,
    document.body
  );
};

export default PanoramaLightBox;
