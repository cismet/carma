import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types/types";

import { planeLog } from "./annotation-plane-flag";
import { lngLatToScene, overlayOffset } from "./annotation-scene-space";
import type { PlaneCamera } from "./annotation-plane";
import type { AnnotationAnchor, AnnotationSyncLimits } from "./types";

/** excalidraw clamps zoom.value to this range; see its getNormalizedZoom */
const MIN_SCENE_ZOOM = 0.1;
const MAX_SCENE_ZOOM = 30;

/** under a hundredth of a pixel the two cameras are the same camera */
const EPSILON = 0.01;

/** a scene that will not take our camera must not be pushed at forever */
const REPUSH_LIMIT = 5;

/**
 * How far the map's scale may drift from the one the scene was painted at
 * before the camera is written mid-gesture, in zoom levels. Only while the map
 * is turned or tilted; see `followsMap`.
 *
 * A zoom is the one gesture the matrix cannot carry for free. Rotation, pitch
 * and pan move a finished bitmap around, which costs nothing and loses
 * nothing; a zoom magnifies it, and a magnified bitmap is a drawing made of
 * stairsteps until the scene is painted again. So the scale is handed back to
 * excalidraw as it drifts, and the matrix is left with the part it is good at.
 */
const PLANE_RESCALE_LEVELS = 1 / 8;

/**
 * How long after a gesture a camera from the scene still counts as the user's.
 * Excalidraw reports a change a tick or two after the click that caused it.
 */
const GESTURE_TAIL_MS = 300;

/** the lng/lat the scene puts at (0, 0), and the map zoom where scale is 1 */
type Anchor = AnnotationAnchor;

type SceneCamera = { scrollX: number; scrollY: number; scale: number };

/** a camera we wrote, kept with the anchor it was worked out against */
type PushedCamera = SceneCamera & { anchor: Anchor };

const same = (a: SceneCamera, b: SceneCamera) =>
  Math.abs(a.scrollX - b.scrollX) < EPSILON &&
  Math.abs(a.scrollY - b.scrollY) < EPSILON &&
  Math.abs(a.scale - b.scale) < EPSILON;

/**
 * Pins the scene to the ground at one anchor lng/lat, taken from the camera
 * while `live` and the scene is still empty.
 *
 * With the ground plane on, this is the slow half of the two: it writes
 * excalidraw's camera when the map comes to rest, and never in between. What
 * happens during a gesture is a matrix, see `annotation-plane`. The camera the
 * plane is solved against is not the one we wrote but the one the scene says
 * it is rendering with, delivered through `onSceneChange` — so a value
 * excalidraw clamped or moved on its own is compensated by the matrix instead
 * of putting the drawing in the wrong place. The scene never drives the map;
 * the gestures that used to reach it that way are handed to maplibre in
 * `annotation-plane-pointer`.
 *
 * With the plane off this is what it always was: the map drives the scene on
 * every `move` through excalidraw's `screen = (scene + scroll) * zoom`, the
 * scene drives the map while it owns the pointer, `pushedRef` breaks the loop,
 * and `limits` hides the overlay wherever that shared transform stops holding
 * — on a rotated or tilted map, or past excalidraw's zoom clamp.
 */
export const useMapSceneSync = (
  map: MaplibreMap | null,
  api: ExcalidrawImperativeAPI | null,
  overlay: HTMLElement | null,
  /** whether the overlay currently takes pointer events */
  interactive: boolean,
  live: boolean,
  limits: AnnotationSyncLimits,
  savedAnchor?: AnnotationAnchor,
  /** the drawing follows bearing and pitch; see `annotation-plane-flag` */
  plane = false
) => {
  const {
    rotated: hideRotated = false,
    tilted: hideTilted = false,
    zoom: hideZoom = false,
  } = limits;
  const anchorRef = useRef<Anchor | null>(savedAnchor ?? null);
  const restoredRef = useRef(Boolean(savedAnchor));
  const pushedRef = useRef<PushedCamera | null>(null);
  /** false until the scene has handed a camera of ours back through onChange */
  const primedRef = useRef(false);
  const repushRef = useRef(0);
  const [inSync, setInSync] = useState(false);

  /** the camera the plane is solved against: what the scene is rendering with */
  const appliedRef = useRef<PlaneCamera | null>(null);

  const holdingRef = useRef(false);
  const touchedRef = useRef(0);
  /**
   * Whether the user is working in the scene right now. Excalidraw's onChange
   * says nothing about where a camera came from, so the pointer is the only
   * honest signal that a camera is the user's and not an echo of ours.
   */
  const userDriven = useCallback(
    () =>
      holdingRef.current ||
      performance.now() - touchedRef.current < GESTURE_TAIL_MS,
    []
  );

  useEffect(() => {
    if (!overlay) {
      return;
    }
    const down = () => {
      holdingRef.current = true;
      touchedRef.current = performance.now();
    };
    const up = () => {
      holdingRef.current = false;
      touchedRef.current = performance.now();
    };
    const touch = () => {
      touchedRef.current = performance.now();
    };
    overlay.addEventListener("pointerdown", down, true);
    overlay.addEventListener("keydown", touch, true);
    // the pointer may well be let go somewhere else entirely
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      overlay.removeEventListener("pointerdown", down, true);
      overlay.removeEventListener("keydown", touch, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [overlay]);

  /** the overlay's top left inside the map container, what `project` counts from */
  const offsetOf = useCallback(() => {
    if (!map || !overlay) {
      return { x: 0, y: 0 };
    }
    return overlayOffset(map, overlay);
  }, [map, overlay]);

  const applyMapCamera = useCallback(() => {
    const anchor = anchorRef.current;
    if (!map || !api || !anchor) {
      return;
    }

    const scale = 2 ** (map.getZoom() - anchor.zoom);
    const inZoomRange = scale >= MIN_SCENE_ZOOM && scale <= MAX_SCENE_ZOOM;
    const usable = plane
      ? !hideZoom || inZoomRange
      : (!hideRotated || map.getBearing() === 0) &&
        (!hideTilted || map.getPitch() === 0) &&
        (!hideZoom || inZoomRange);
    // with the plane on, what the scene is rendering with is what decides
    if (!plane) {
      setInSync(usable);
    } else if (!usable) {
      setInSync(false);
    }
    if (!usable) {
      return;
    }

    const offset = offsetOf();
    const box = overlay?.getBoundingClientRect();
    /**
     * Where the plane sits on the ground.
     *
     * Asked in ground terms, never in screen terms. `project` answers where
     * the anchor has ended up on the screen, and that answer carries the
     * bearing inside it — while the plane is a north-up rectangle on the
     * ground. Using one as the other places the plane's ground footprint off
     * by the rotation of the vector from the anchor to the middle of the view,
     * which is nothing at all north-up and more than that vector's own length
     * once the map is turned past ninety degrees. The drawing then runs off
     * the edge of the canvas: a straight cut through a shape, and then no
     * shape.
     *
     * So the ground under the middle of the plane is what the plane is centred
     * on, which is true at any bearing and any pitch, and is the same
     * arithmetic as before whenever the bearing is zero.
     */
    const camera: SceneCamera =
      plane && box && box.width > 0 && box.height > 0
        ? (() => {
            const middle = map.unproject([
              offset.x + box.width / 2,
              offset.y + box.height / 2,
            ]);
            const centre = lngLatToScene(anchor, middle.lng, middle.lat);
            return {
              scrollX: box.width / (2 * scale) - centre.x,
              scrollY: box.height / (2 * scale) - centre.y,
              scale,
            };
          })()
        : // the anchor is scene (0, 0), so its screen position is scroll * scale
          (() => {
            const point = map.project([anchor.lng, anchor.lat]);
            return {
              scrollX: (point.x - offset.x) / scale,
              scrollY: (point.y - offset.y) / scale,
              scale,
            };
          })();
    if (plane && pushedRef.current && same(camera, pushedRef.current)) {
      /**
       * The same numbers under a different anchor. `reanchor` hands out one of
       * these on every `moveend` an empty drawing sees — scale exactly 1, the
       * scroll the middle of the box — so the scene has nothing to redraw and
       * would never echo, leaving the pair the plane and the decoration read
       * pointing at an anchor the drawing left behind. Everything measured
       * against that pair then quietly stops: `normalize` sees two anchors
       * that disagree and does nothing, pass after pass, and the strokes keep
       * whatever width they were last given. So the label is corrected here,
       * without asking the scene for anything.
       */
      const applied = appliedRef.current;
      if (applied && applied.anchor !== anchor) {
        appliedRef.current = { ...applied, anchor };
        map.triggerRepaint();
      }
      pushedRef.current = { ...camera, anchor };
      return;
    }

    pushedRef.current = { ...camera, anchor };
    api.updateScene({
      appState: {
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        zoom: { value: scale as NormalizedZoomValue },
      },
    });
  }, [api, hideRotated, hideTilted, hideZoom, map, offsetOf, overlay, plane]);

  const applySceneCamera = useCallback(
    (state: Pick<AppState, "scrollX" | "scrollY" | "zoom">) => {
      const anchor = anchorRef.current;
      const pushed = pushedRef.current;
      // before the first push the scene holds its own defaults, not a camera
      if (!map || !anchor || !pushed) {
        return;
      }

      const camera: SceneCamera = {
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        scale: state.zoom.value,
      };

      if (plane) {
        if (!primedRef.current) {
          // excalidraw's own default lands after our first push, and following
          // that would put the plane half a viewport off
          if (!same(camera, pushed) && repushRef.current < REPUSH_LIMIT) {
            repushRef.current += 1;
            applyMapCamera();
            return;
          }
          primedRef.current = true;
        }
        const applied = appliedRef.current;
        if (
          applied &&
          applied.anchor === pushed.anchor &&
          same(camera, {
            scrollX: applied.scrollX,
            scrollY: applied.scrollY,
            scale: applied.zoom,
          })
        ) {
          return;
        }
        /**
         * Straight away, in the same turn the scene reports it. The canvas has
         * already been repainted with this camera; a matrix still solved from
         * the one before it draws the scene at the ratio between the two, and
         * across a rebase that ratio is the whole zoom step. It carries the
         * anchor the camera was pushed with, because that is the only anchor
         * these coordinates mean anything against.
         */
        appliedRef.current = {
          anchor: pushed.anchor,
          scrollX: camera.scrollX,
          scrollY: camera.scrollY,
          zoom: camera.scale,
        };
        planeLog("camera", {
          anchorZoom: pushed.anchor.zoom,
          zoom: camera.scale,
          mapZoom: map.getZoom(),
        });
        setInSync(true);
        map.triggerRepaint();
        return;
      }

      if (same(camera, pushed)) {
        // our own camera coming back: the scene is speaking our coordinates now
        primedRef.current = true;
        repushRef.current = 0;
        return;
      }

      // A camera that is not ours is only the user when the scene is primed,
      // the overlay owns the pointer, and the user is actually working in it.
      // Otherwise it is excalidraw's own default landing after our first push,
      // or an echo of a camera we have already replaced — the map must not
      // follow either, the scene must be put back.
      if (!primedRef.current || !interactive || !inSync || !userDriven()) {
        if (repushRef.current < REPUSH_LIMIT) {
          repushRef.current += 1;
          applyMapCamera();
        }
        return;
      }

      const offset = offsetOf();
      const targetX = camera.scrollX * camera.scale + offset.x;
      const targetY = camera.scrollY * camera.scale + offset.y;
      const zoom = anchor.zoom + Math.log2(camera.scale);

      // the anchor's position depends on the zoom, so set that first
      map.jumpTo({ zoom });
      const point = map.project([anchor.lng, anchor.lat]);
      const centre = map.project(map.getCenter());
      map.jumpTo({
        zoom,
        center: map.unproject([
          centre.x + point.x - targetX,
          centre.y + point.y - targetY,
        ]),
      });
    },
    [applyMapCamera, inSync, interactive, map, offsetOf, plane, userDriven]
  );

  /**
   * What happens between two rests, per frame.
   *
   * The matrix exists for the one thing excalidraw's camera cannot say:
   * a turned or tilted ground. While the map is north-up and flat it has
   * nothing to add — every camera the map can be at is a scroll and a zoom,
   * which the scene expresses itself — so the camera is written each frame and
   * the matrix stays the identity. That matters more than the cost: a canvas
   * under any transform at all, even one a few percent off, is composited and
   * resampled every frame, and resampling a one pixel line at a fraction of a
   * scale is a drawing made of stairsteps. `transform: none` is the only state
   * that is genuinely sharp, and north-up is the state the map is in almost
   * all of the time.
   *
   * Turned or tilted, the matrix is unavoidable and the picture is a scaled
   * bitmap whatever we do, so the camera is only rewritten once the scale has
   * drifted far enough to show — which no rotation and no pan ever does.
   */
  const followsMap = useCallback(() => {
    const anchor = anchorRef.current;
    if (!map || !anchor) {
      return;
    }
    if (map.getBearing() === 0 && map.getPitch() === 0) {
      applyMapCamera();
      return;
    }
    const applied = appliedRef.current;
    if (!applied || applied.anchor !== anchor) {
      return;
    }
    const screen = 2 ** (map.getZoom() - anchor.zoom);
    if (!(screen > 0) || !(applied.zoom > 0)) {
      return;
    }
    if (Math.abs(Math.log2(screen / applied.zoom)) < PLANE_RESCALE_LEVELS) {
      return;
    }
    applyMapCamera();
  }, [applyMapCamera, map]);

  // a fresh excalidraw starts from its own defaults again, so nothing it says
  // counts as a camera until it has echoed one of ours
  useEffect(() => {
    pushedRef.current = null;
    primedRef.current = false;
    repushRef.current = 0;
    appliedRef.current = null;
  }, [api]);

  useEffect(() => {
    if (!map || !api) {
      return;
    }
    if (live && !restoredRef.current && api.getSceneElements().length === 0) {
      const { lng, lat } = map.getCenter();
      anchorRef.current = { lng, lat, zoom: map.getZoom() };
    }
    if (!anchorRef.current) {
      return;
    }

    applyMapCamera();
    // the plane carries the camera through a gesture, so the scene is only
    // written where a write costs nothing: at rest
    const moved = plane ? "moveend" : "move";
    map.on(moved, applyMapCamera);
    map.on("resize", applyMapCamera);
    if (plane) {
      map.on("move", followsMap);
    }

    // the measured offset moves whenever the app's chrome does
    const sizes = overlay ? new ResizeObserver(applyMapCamera) : null;
    if (overlay && sizes) {
      sizes.observe(overlay);
    }

    return () => {
      map.off(moved, applyMapCamera);
      map.off("resize", applyMapCamera);
      map.off("move", followsMap);
      sizes?.disconnect();
    };
  }, [api, applyMapCamera, live, map, overlay, plane, followsMap]);

  const getAnchor = useCallback(() => anchorRef.current, []);

  const getPlaneCamera = useCallback(() => appliedRef.current, []);

  /**
   * Pins the scene at the current camera, so it renders at 100 % right here.
   * Only sound while the scene is empty: element coordinates are read against
   * the anchor, so moving it would drag the drawing across the ground.
   */
  const reanchor = useCallback(() => {
    if (!map) {
      return;
    }
    const { lng, lat } = map.getCenter();
    anchorRef.current = { lng, lat, zoom: map.getZoom() };
    restoredRef.current = true;
    // the scene's camera is read against the anchor, so every camera still in
    // flight now means something else than it did. Nothing the scene says
    // counts again until it has echoed the camera for this anchor.
    primedRef.current = false;
    repushRef.current = 0;
    applyMapCamera();
  }, [applyMapCamera, map]);

  /**
   * Moves the anchor to another zoom without moving it on the ground. Scene
   * units are map pixels at the anchor's zoom, so every coordinate in the
   * scene means something else afterwards: whoever calls this rewrites the
   * elements by the same factor in the same tick, see `annotation-normalize`.
   */
  const setAnchorZoom = useCallback(
    (zoom: number) => {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }
      anchorRef.current = { ...anchor, zoom };
      // the camera in flight was read against the old anchor and means
      // something else now; nothing counts until the scene echoes this one
      primedRef.current = false;
      repushRef.current = 0;
      applyMapCamera();
    },
    [applyMapCamera]
  );

  return {
    inSync,
    onSceneChange: applySceneCamera,
    getAnchor,
    getPlaneCamera,
    reanchor,
    setAnchorZoom,
  };
};
