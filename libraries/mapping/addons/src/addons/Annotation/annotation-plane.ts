import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  HORIZON_W,
  IDENTITY,
  apply,
  clipToHorizon,
  cssClipPath,
  cssTransform,
  invert,
  solveHomography,
  translated,
} from "./annotation-homography";
import type { Mat3, Point } from "./annotation-homography";
import { planeLog } from "./annotation-plane-active";
import { groundOffset, lngLatToScene } from "./annotation-scene-space";
import type { AnnotationAnchor } from "./types";

/**
 * The overlay as a ground plane.
 *
 * Excalidraw's own camera is static: it is written when the map comes to rest
 * and nothing touches it in between, so the scene keeps the coordinates it was
 * drawn in and excalidraw is never asked to re-render for a camera move. What
 * the map does between two rests is carried by one CSS matrix per canvas,
 * solved fresh in `render` — the frame maplibre is already painting, not a
 * `requestAnimationFrame` of our own behind it. That is what keeps a fast
 * rotation lag free: the drawing and the map are composited from the same
 * frame.
 *
 * The transform goes on the canvases, not on the container. The container is
 * what excalidraw measures for `offsetLeft`/`offsetTop` and what its toolbar,
 * its popovers and its text editor are laid out in, so it stays a plain,
 * upright, untransformed box.
 *
 * The plane is larger than the map area, and by how much is the camera's
 * answer, not a constant: it is asked for the ground it is actually looking
 * at, per side, and the box is grown to hold it. Flat and north-up that is
 * nothing; a bearing turns the corners out; a pitch pushes the far side out a
 * long way, because a tilted camera sees ground that is several screens deep.
 * See `reachOf`. The box is clipped back to the map area in CSS, so the extra
 * never covers the app's own chrome and never takes a pointer event meant for
 * it.
 */

/** the least the plane hangs past the map area, per side, of the area's size */
const PLANE_MARGIN = 0.15;

/** and never further than this on the ground, in map pixels, per side */
const MAX_PLANE_MARGIN_PX = 4096;

/**
 * What the two excalidraw canvases may cost together, in device pixels. A
 * plane twice the size of the viewport is four times the canvas, which on a
 * large retina screen is hundreds of megabytes; past this the margin is given
 * back until it fits.
 */
const PLANE_DEVICE_PX_BUDGET = 24e6;

/**
 * Margins move in steps of this many pixels. Every change of one resizes both
 * canvases and makes excalidraw paint the whole scene again, so the camera is
 * not followed to the pixel: a tilt walks the margin in steps, and a wobble
 * inside a step costs nothing.
 */
const MARGIN_STEP = 128;

/** how close a point has to come back to count as ground in front of the camera */
const ROUND_TRIP_PX = 1.5;

/** how far a look at the horizon is taken to reach, in map pixels */
const HORIZON_REACH_PX = 1e5;

/**
 * The screen points the homography is solved from, as fractions of the map
 * area. All four sit in the lower half, where the ground is in front of the
 * camera at any pitch, and they are spread wide so the fit stays conditioned.
 */
const SEEDS: readonly [number, number][] = [
  [0.05, 0.55],
  [0.95, 0.55],
  [0.95, 0.95],
  [0.05, 0.95],
];

/**
 * The camera the scene is painted with, and the anchor its coordinates are
 * counted from. The two travel together and are never read apart: a rebase
 * moves both at once, and a plane solved from a new anchor against the camera
 * before it draws the whole scene at the ratio between them — four zoom levels
 * of rebase is the drawing sixteen times its size, across the screen.
 */
export type PlaneCamera = {
  anchor: AnnotationAnchor;
  scrollX: number;
  scrollY: number;
  zoom: number;
};

export type PlaneMargin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** the map area the plane is grown around, in map container pixels */
export type PlaneArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const NO_MARGIN: PlaneMargin = { top: 0, right: 0, bottom: 0, left: 0 };

const sameMargin = (a: PlaneMargin, b: PlaneMargin) =>
  a.top === b.top &&
  a.right === b.right &&
  a.bottom === b.bottom &&
  a.left === b.left;

/**
 * How far past the map area the ground under the view reaches, per side, in
 * map pixels of the current zoom.
 *
 * Asked of the camera, one `unproject` per sample. Flat and north-up the
 * answer is zero on every side: the screen and the ground are the same
 * rectangle. A bearing turns that rectangle, so its corners want room. A pitch
 * is what makes it big — the top of a screen tilted sixty degrees is four or
 * five screens away on the ground, and every pixel of that has to be somewhere
 * on the canvas or the drawing out there simply is not painted.
 *
 * A sample above the horizon has no ground under it at all. `unproject` still
 * answers, with the point where the ray crosses the plane *behind* the camera,
 * so the answer is checked by projecting it back: a point that does not come
 * home is walked back towards the middle until one does, and the direction it
 * died in is taken to reach as far as the cap allows.
 */
const reachOf = (map: MaplibreMap, area: PlaneArea) => {
  const zoom = map.getZoom();
  const middleX = area.x + area.width / 2;
  const middleY = area.y + area.height / 2;
  const middle = map.unproject([middleX, middleY]);
  if (!Number.isFinite(middle.lng) || !Number.isFinite(middle.lat)) {
    return null;
  }

  /** the ground under a screen point, or null when it is past the horizon */
  const ground = (x: number, y: number) => {
    const at = map.unproject([x, y]);
    if (!Number.isFinite(at.lng) || !Number.isFinite(at.lat)) {
      return null;
    }
    const back = map.project(at);
    if (
      Math.abs(back.x - x) > ROUND_TRIP_PX ||
      Math.abs(back.y - y) > ROUND_TRIP_PX
    ) {
      return null;
    }
    const offset = groundOffset(middle, at, zoom);
    return Number.isFinite(offset.x) && Number.isFinite(offset.y)
      ? offset
      : null;
  };

  const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const hold = (point: { x: number; y: number }) => {
    box.minX = Math.min(box.minX, point.x);
    box.minY = Math.min(box.minY, point.y);
    box.maxX = Math.max(box.maxX, point.x);
    box.maxY = Math.max(box.maxY, point.y);
  };

  const sample = (x: number, y: number) => {
    const direct = ground(x, y);
    if (direct) {
      hold(direct);
      return;
    }
    // past the horizon: how far along the way there the ground still answers
    let last: { x: number; y: number } | null = null;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 14; step += 1) {
      const middleT = (low + high) / 2;
      const at = ground(
        middleX + (x - middleX) * middleT,
        middleY + (y - middleY) * middleT
      );
      if (at) {
        last = at;
        low = middleT;
      } else {
        high = middleT;
      }
    }
    if (!last) {
      return;
    }
    const length = Math.hypot(last.x, last.y);
    hold(
      length > 0
        ? {
            x: (last.x / length) * HORIZON_REACH_PX,
            y: (last.y / length) * HORIZON_REACH_PX,
          }
        : last
    );
  };

  const steps = 8;
  for (let index = 0; index <= steps; index += 1) {
    const along = index / steps;
    sample(area.x + area.width * along, area.y);
    sample(area.x + area.width * along, area.y + area.height);
    sample(area.x, area.y + area.height * along);
    sample(area.x + area.width, area.y + area.height * along);
  }

  return {
    top: Math.max(0, -box.minY - area.height / 2),
    right: Math.max(0, box.maxX - area.width / 2),
    bottom: Math.max(0, box.maxY - area.height / 2),
    left: Math.max(0, -box.minX - area.width / 2),
  };
};

/**
 * The margin the camera asks for, cut back to what two canvases may cost. The
 * four sides are cut by one factor, so the shape of what the camera wants
 * survives the cut: at a pitch the far side keeps most of the room even after
 * the budget has taken its share.
 */
const marginFor = (map: MaplibreMap | null, area: PlaneArea): PlaneMargin => {
  const { width, height } = area;
  if (width <= 0 || height <= 0) {
    return NO_MARGIN;
  }
  const reach = (map && reachOf(map, area)) ?? NO_MARGIN;
  const floorX = width * PLANE_MARGIN;
  const floorY = height * PLANE_MARGIN;
  const capped = (value: number, floor: number) =>
    Math.min(Math.max(value, floor), MAX_PLANE_MARGIN_PX);
  const wanted: PlaneMargin = {
    top: capped(reach.top, floorY),
    right: capped(reach.right, floorX),
    bottom: capped(reach.bottom, floorY),
    left: capped(reach.left, floorX),
  };

  const ratio = globalThis.devicePixelRatio || 1;
  let factor = 1;
  const cost = () =>
    (width + (wanted.left + wanted.right) * factor) *
    (height + (wanted.top + wanted.bottom) * factor) *
    ratio *
    ratio *
    2;
  while (factor > 0.02 && cost() > PLANE_DEVICE_PX_BUDGET) {
    factor *= 0.8;
  }

  const step = (value: number) =>
    Math.round((value * factor) / MARGIN_STEP) * MARGIN_STEP;
  return {
    top: step(wanted.top),
    right: step(wanted.right),
    bottom: step(wanted.bottom),
    left: step(wanted.left),
  };
};

/**
 * How much the plane box hangs past the map area on each side.
 *
 * Recomputed while the camera turns, but only when it has turned far enough to
 * matter: every change resizes both canvases and repaints the scene, so a
 * degree of pitch is the resolution and a gesture is only ever allowed to grow
 * the box. What it wants to give back is given back once the map is at rest.
 */
export const usePlaneMargin = (
  map: MaplibreMap | null,
  host: HTMLElement | null,
  inset: PlaneMargin,
  enabled: boolean
): PlaneMargin => {
  const [margin, setMargin] = useState<PlaneMargin>(NO_MARGIN);
  const insetRef = useRef(inset);
  insetRef.current = inset;

  useEffect(() => {
    if (!host || !enabled) {
      setMargin(NO_MARGIN);
      return;
    }

    /** the map area the overlay covers, in the map container's coordinates */
    const areaOf = (): PlaneArea | null => {
      const box = host.getBoundingClientRect();
      const gap = insetRef.current;
      const origin = map
        ? map.getContainer().getBoundingClientRect()
        : { left: box.left, top: box.top };
      return {
        x: box.left + gap.left - origin.left,
        y: box.top + gap.top - origin.top,
        width: box.width - gap.left - gap.right,
        height: box.height - gap.top - gap.bottom,
      };
    };

    let moving = false;
    let key = "";
    const measure = (force: boolean) => {
      const area = areaOf();
      if (!area || area.width <= 0 || area.height <= 0) {
        return;
      }
      const next = map
        ? `${Math.round(map.getPitch())}|${Math.round(map.getBearing())}|${
            Math.round(area.width) + "x" + Math.round(area.height)
          }`
        : `${Math.round(area.width)}x${Math.round(area.height)}`;
      if (!force && next === key) {
        return;
      }
      key = next;
      const wanted = marginFor(map, area);
      planeLog("margin", {
        pitch: map?.getPitch() ?? null,
        bearing: map?.getBearing() ?? null,
        area,
        reach: map ? reachOf(map, area) : null,
        wanted,
        ratio: globalThis.devicePixelRatio || 1,
      });
      setMargin((current) => {
        // a gesture may only grow the box; shrinking it mid-tilt costs a
        // canvas resize and a full repaint for room we are about to want back
        const merged = moving
          ? {
              top: Math.max(current.top, wanted.top),
              right: Math.max(current.right, wanted.right),
              bottom: Math.max(current.bottom, wanted.bottom),
              left: Math.max(current.left, wanted.left),
            }
          : wanted;
        return sameMargin(current, merged) ? current : merged;
      });
    };

    measure(true);
    const sizes = new ResizeObserver(() => measure(true));
    sizes.observe(host);

    if (!map) {
      return () => {
        sizes.disconnect();
      };
    }
    const onStart = () => {
      moving = true;
    };
    const onMove = () => measure(false);
    const onRest = () => {
      moving = false;
      measure(true);
    };
    map.on("movestart", onStart);
    map.on("move", onMove);
    map.on("moveend", onRest);
    return () => {
      sizes.disconnect();
      map.off("movestart", onStart);
      map.off("move", onMove);
      map.off("moveend", onRest);
    };
  }, [enabled, host, map]);

  return margin;
};

export type GroundPlane = {
  /** the client position of a scene point, under the camera of this frame */
  sceneToScreen: (x: number, y: number) => Point | null;
  /** the scene position under a client point */
  screenToScene: (clientX: number, clientY: number) => Point | null;
  /**
   * The client position excalidraw has to be told about for a client point:
   * the same point, expressed on the untransformed plane. See
   * `annotation-plane-pointer`.
   */
  screenToPlaneClient: (clientX: number, clientY: number) => Point | null;
};

export type UseGroundPlaneOptions = {
  map: MaplibreMap | null;
  /** the scene's own box, the plane */
  box: HTMLElement | null;
  /**
   * The camera excalidraw is actually rendering with, and the anchor that
   * camera was computed against. Null until the scene has taken one. Nothing
   * here reads the anchor from anywhere else, see `PlaneCamera`.
   */
  getCamera: () => PlaneCamera | null;
  enabled: boolean;
};

const isDrawingCanvas = (canvas: HTMLCanvasElement) =>
  canvas.classList.contains("excalidraw__canvas");

const localOffset = (element: HTMLElement, box: HTMLElement): Point | null => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== box) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === box ? { x, y } : null;
};

export const useGroundPlane = ({
  map,
  box,
  getCamera,
  enabled,
}: UseGroundPlaneOptions): GroundPlane => {
  const matrixRef = useRef<Mat3>(IDENTITY);
  const inverseRef = useRef<Mat3>(IDENTITY);
  const cameraRef = useRef<PlaneCamera | null>(null);

  const cameraFn = useRef(getCamera);
  cameraFn.current = getCamera;

  useEffect(() => {
    if (!map || !box || !enabled) {
      matrixRef.current = IDENTITY;
      inverseRef.current = IDENTITY;
      cameraRef.current = null;
      return;
    }

    const canvases = box.getElementsByTagName("canvas");
    const editors = box.getElementsByClassName("excalidraw-wysiwyg");

    const write = (transform: string, clip: string) => {
      for (let index = 0; index < canvases.length; index += 1) {
        const canvas = canvases[index];
        if (!isDrawingCanvas(canvas)) {
          continue;
        }
        if (canvas.style.transformOrigin !== "0px 0px") {
          canvas.style.transformOrigin = "0 0";
        }
        if (canvas.style.transform !== transform) {
          canvas.style.transform = transform;
        }
        if (canvas.style.clipPath !== clip) {
          canvas.style.clipPath = clip;
        }
      }
    };

    /**
     * The text editor is put where its anchor lands but kept upright: a
     * textarea drawn through the matrix would be skewed, and a skewed caret is
     * not something anyone can type into.
     */
    const billboard = (matrix: Mat3) => {
      for (let index = 0; index < editors.length; index += 1) {
        const editor = editors[index];
        if (!(editor instanceof HTMLElement)) {
          continue;
        }
        const at = localOffset(editor, box);
        const to = at ? apply(matrix, at.x, at.y) : null;
        const transform =
          at && to
            ? `translate(${(to.x - at.x).toFixed(2)}px, ${(to.y - at.y).toFixed(
                2
              )}px)`
            : "";
        if (editor.style.transform !== transform) {
          editor.style.transform = transform;
          editor.style.transformOrigin = "0 0";
        }
      }
    };

    const clear = () => {
      write("none", "none");
      billboard(IDENTITY);
      matrixRef.current = IDENTITY;
      inverseRef.current = IDENTITY;
    };

    const tick = () => {
      const camera = cameraFn.current();
      cameraRef.current = camera;
      if (!camera || !(camera.zoom > 0)) {
        clear();
        return;
      }
      const rect = box.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const area = map.getContainer().getBoundingClientRect();

      const source: Point[] = [];
      const screen: Point[] = [];
      for (const [fx, fy] of SEEDS) {
        const at = { x: area.width * fx, y: area.height * fy };
        const lngLat = map.unproject([at.x, at.y]);
        const scene = lngLatToScene(camera.anchor, lngLat.lng, lngLat.lat);
        source.push({
          x: (scene.x + camera.scrollX) * camera.zoom,
          y: (scene.y + camera.scrollY) * camera.zoom,
        });
        screen.push({
          x: area.left + at.x - rect.left,
          y: area.top + at.y - rect.top,
        });
      }

      // solved around the middle of the seeds, a point that is in front of the
      // camera by construction; see `annotation-homography`
      const centre = source.reduce(
        (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
        { x: 0, y: 0 }
      );
      const solved = solveHomography(
        source.map((point) => ({
          x: point.x - centre.x,
          y: point.y - centre.y,
        })),
        screen
      );
      if (!solved) {
        clear();
        return;
      }
      const matrix = translated(solved, centre.x, centre.y);
      const inverse = invert(matrix);
      if (!inverse) {
        clear();
        return;
      }
      matrixRef.current = matrix;
      inverseRef.current = inverse;

      const corners: Point[] = [
        { x: 0, y: 0 },
        { x: rect.width, y: 0 },
        { x: rect.width, y: rect.height },
        { x: 0, y: rect.height },
      ];
      write(
        cssTransform(matrix, rect.width, rect.height),
        cssClipPath(clipToHorizon(corners, matrix, HORIZON_W), corners)
      );
      billboard(matrix);
    };

    tick();
    map.on("render", tick);
    const sizes = new ResizeObserver(() => {
      map.triggerRepaint();
    });
    sizes.observe(box);
    return () => {
      map.off("render", tick);
      sizes.disconnect();
      clear();
    };
  }, [box, enabled, map]);

  const sceneToScreen = useCallback(
    (x: number, y: number): Point | null => {
      const camera = cameraRef.current;
      if (!box || !camera) {
        return null;
      }
      const at = apply(
        matrixRef.current,
        (x + camera.scrollX) * camera.zoom,
        (y + camera.scrollY) * camera.zoom
      );
      if (!at) {
        return null;
      }
      const rect = box.getBoundingClientRect();
      return { x: at.x + rect.left, y: at.y + rect.top };
    },
    [box]
  );

  const screenToPlaneClient = useCallback(
    (clientX: number, clientY: number): Point | null => {
      if (!box) {
        return null;
      }
      const rect = box.getBoundingClientRect();
      const at = apply(
        inverseRef.current,
        clientX - rect.left,
        clientY - rect.top
      );
      return at ? { x: at.x + rect.left, y: at.y + rect.top } : null;
    },
    [box]
  );

  const screenToScene = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const camera = cameraRef.current;
      const local = screenToPlaneClient(clientX, clientY);
      if (!box || !camera || !local) {
        return null;
      }
      const rect = box.getBoundingClientRect();
      return {
        x: (local.x - rect.left) / camera.zoom - camera.scrollX,
        y: (local.y - rect.top) / camera.zoom - camera.scrollY,
      };
    },
    [box, screenToPlaneClient]
  );

  return { sceneToScreen, screenToScene, screenToPlaneClient };
};
