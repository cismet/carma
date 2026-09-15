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
import {
  groundOffset,
  lngLatToScene,
  sceneToLngLat,
} from "./annotation-scene-space";
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
 *
 * What a tilted camera looks at is more ground than any canvas can hold at
 * full size. That is not answered by cutting the box back — a cut box is a
 * drawing that ends in mid air — but by painting the scene smaller, see
 * `MIN_PLANE_QUALITY`.
 */

/** the least the plane hangs past the map area, per side, of the area's size */
const PLANE_MARGIN = 0.15;

/** and never further than this on the ground, in map pixels, per side */
const MAX_PLANE_MARGIN_PX = 4096;

/**
 * What the two excalidraw canvases may cost together, in device pixels. A
 * plane twice the size of the viewport is four times the canvas, which on a
 * large retina screen is hundreds of megabytes; past this the scene is painted
 * smaller until it fits, see `MIN_PLANE_QUALITY`.
 */
const PLANE_DEVICE_PX_BUDGET = 24e6;

/**
 * The least the plane may be painted at, in box pixels per map pixel.
 *
 * A pitched camera looks at several screens of ground, which is more canvas
 * than the budget buys. Cutting the box back to what it does buy is what cut
 * the drawing: ground the camera is looking at is then simply not painted, and
 * a shape out there ends at a straight edge in mid air.
 *
 * So the box is not cut. The scene is painted smaller — `quality` box pixels
 * per map pixel — and the same matrix that puts the plane on screen blows it
 * back up, because the matrix is solved from the camera the scene is actually
 * painted with and carries whatever scale that camera has. All the ground the
 * camera asked for is there; it is a magnified bitmap, softer the further the
 * quality is from 1.
 *
 * The trade has an end. A stroke painted well under a pixel does not come back
 * as a soft stroke, it comes back as grey crumbs, so below this the ground is
 * given back after all and the far side is cut as it was before.
 */
const MIN_PLANE_QUALITY = 0.25;

/**
 * Quality moves in steps of this. Every change repaints the whole scene, so a
 * tilt is not followed continuously: it walks the quality in steps, and a
 * wobble inside a step costs nothing. The same bargain as `MARGIN_STEP`.
 */
const QUALITY_STEP = 1 / 32;

/** how finely the comfort margin is given back to the budget */
const COMFORT_STEPS = 8;

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
 * The drawing's own box on the ground, for the plane to be sized to it.
 *
 * Kept with the anchor its coordinates are counted from, like every other pair
 * of scene coordinates here: a box read against the wrong anchor is a box in
 * the wrong place by the ratio between the two.
 */
export type PlaneContent = {
  anchor: AnnotationAnchor;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

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
  /** the box pixels per map pixel that zoom was taken at; see `PlaneFit` */
  quality: number;
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
 * The box the scene is painted into: how far it hangs past the map area, and
 * how small the scene is painted to make the camera's ground fit in it. See
 * `MIN_PLANE_QUALITY`.
 */
export type PlaneFit = {
  /** how far the box hangs past the map area, per side, in box pixels */
  margin: PlaneMargin;
  /** box pixels per map pixel, at most 1 */
  quality: number;
  /**
   * How much narrower and shorter the box is than the map area plus its
   * margins. The area is painted at `quality` like everything else, so it
   * takes only `quality` of its own width inside the box, and the box is that
   * much smaller than the layout it is pinned to. Layout only — see the box
   * style in `AnnotationScene`.
   */
  shrink: { x: number; y: number };
};

export const NO_PLANE_FIT: PlaneFit = {
  margin: NO_MARGIN,
  quality: 1,
  shrink: { x: 0, y: 0 },
};

const sameFit = (a: PlaneFit, b: PlaneFit) =>
  sameMargin(a.margin, b.margin) &&
  a.quality === b.quality &&
  a.shrink.x === b.shrink.x &&
  a.shrink.y === b.shrink.y;

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
 * How far past the map area the drawing itself reaches, per side, in map
 * pixels of the current zoom.
 *
 * The same ground arithmetic as `reachOf`, asked of the scene instead of the
 * camera: the drawing's own box, put on the ground through its anchor and
 * measured out from the middle of the map area. No camera in it at all, so a
 * pitch does not change the answer — a drawing covers the ground it covers.
 */
const contentReach = (
  map: MaplibreMap,
  area: PlaneArea,
  content: PlaneContent
): PlaneMargin | null => {
  const zoom = map.getZoom();
  const middle = map.unproject([
    area.x + area.width / 2,
    area.y + area.height / 2,
  ]);
  if (!Number.isFinite(middle.lng) || !Number.isFinite(middle.lat)) {
    return null;
  }
  const { minX, minY, maxX, maxY } = content.bounds;
  const corners: readonly [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let first = true;
  for (const [x, y] of corners) {
    const at = sceneToLngLat(content.anchor, x, y);
    const offset = groundOffset(middle, at, zoom);
    if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
      return null;
    }
    if (first) {
      box.minX = offset.x;
      box.maxX = offset.x;
      box.minY = offset.y;
      box.maxY = offset.y;
      first = false;
      continue;
    }
    box.minX = Math.min(box.minX, offset.x);
    box.maxX = Math.max(box.maxX, offset.x);
    box.minY = Math.min(box.minY, offset.y);
    box.maxY = Math.max(box.maxY, offset.y);
  }
  return {
    top: Math.max(0, -box.minY - area.height / 2),
    right: Math.max(0, box.maxX - area.width / 2),
    bottom: Math.max(0, box.maxY - area.height / 2),
    left: Math.max(0, -box.minX - area.width / 2),
  };
};

/**
 * The box the camera asks for, brought inside what two canvases may cost.
 *
 * What has to be covered is the drawing, not the view. Ground with nothing
 * drawn on it can be left unpainted for nothing: there is no shape out there
 * to cut. So the drawing's own box is what the budget must hold, and the rest
 * of what the camera looks at is comfort — room for the next stroke — given
 * back by the `share` loop as the budget needs it.
 *
 * That is what keeps a small drawing sharp at any pitch. A tilted camera looks
 * at several screens of ground and the note on the hill covers a few hundred
 * pixels of it; sizing the plane to the camera bought five screens of empty
 * canvas and paid for it in sharpness, or in a cut. Sizing it to the note
 * costs nothing.
 *
 * Only a drawing that is itself too big for the budget lowers the quality now,
 * and only then is ground given back, by one factor on all four sides.
 */
const fitFor = (
  area: PlaneArea,
  /** how far the camera looks, from `reachOf` */
  camera: PlaneMargin | null,
  /** how far the drawing reaches, from `contentReach`; null means none yet */
  drawn: PlaneMargin | null
): PlaneFit => {
  const { width, height } = area;
  if (width <= 0 || height <= 0) {
    return NO_PLANE_FIT;
  }
  const reach = camera ?? NO_MARGIN;
  const capped = (value: number) => Math.min(value, MAX_PLANE_MARGIN_PX);
  /**
   * What a cut would cut into: the drawing, as far as the camera can see it.
   * Past the camera's own reach there is no screen to be cut off, so the two
   * are taken together. Nothing drawn yet means nothing has to be covered, and
   * the plane is free to spend everything on the comfort below.
   */
  const needed: PlaneMargin = drawn
    ? {
        top: capped(Math.min(drawn.top, reach.top)),
        right: capped(Math.min(drawn.right, reach.right)),
        bottom: capped(Math.min(drawn.bottom, reach.bottom)),
        left: capped(Math.min(drawn.left, reach.left)),
      }
    : NO_MARGIN;
  /** and the room given on top of it, which is only ever comfort */
  const floorX = width * PLANE_MARGIN;
  const floorY = height * PLANE_MARGIN;
  const wanted: PlaneMargin = {
    top: Math.max(capped(reach.top), floorY),
    right: Math.max(capped(reach.right), floorX),
    bottom: Math.max(capped(reach.bottom), floorY),
    left: Math.max(capped(reach.left), floorX),
  };

  const ratio = globalThis.devicePixelRatio || 1;
  /** what the two canvases may cover between them, in box pixels */
  const budget = PLANE_DEVICE_PX_BUDGET / (2 * ratio * ratio);
  /**
   * The quality that just holds the ground that has to be held. Measured
   * against `needed` and not against `wanted`: the comfort is given back to
   * the budget further down, and paying for it in sharpness instead would
   * soften a drawing that fits perfectly well.
   */
  const affordable = Math.sqrt(
    budget /
      ((width + needed.left + needed.right) *
        (height + needed.top + needed.bottom))
  );
  const quality = Math.max(
    MIN_PLANE_QUALITY,
    Math.min(1, Math.floor(affordable / QUALITY_STEP) * QUALITY_STEP)
  );
  // at the floor the quality no longer pays for all of it and the rest comes
  // off the ground, which is the old bargain and the old straight cut
  const held = Math.min(1, affordable / quality);

  /** the margins holding `share` of the comfort room, in box pixels */
  const at = (share: number): PlaneMargin => {
    const side = (need: number, like: number) =>
      quality * (need * held + (like - need) * share);
    return {
      top: side(needed.top, wanted.top),
      right: side(needed.right, wanted.right),
      bottom: side(needed.bottom, wanted.bottom),
      left: side(needed.left, wanted.left),
    };
  };
  const costOf = (margin: PlaneMargin) =>
    (quality * width + margin.left + margin.right) *
    (quality * height + margin.top + margin.bottom);

  // the ground the camera looks at is held whatever it costs; the comfort on
  // top of it is what the budget takes back
  let share = 1;
  for (
    let taken = 0;
    taken < COMFORT_STEPS && costOf(at(share)) > budget;
    taken += 1
  ) {
    share -= 1 / COMFORT_STEPS;
  }
  const margin = at(Math.max(0, share));

  // rounded up, not to the nearest: a step is 128 box pixels, and down at the
  // quality floor that is half a thousand map pixels of ground to give back
  const step = (value: number) => Math.ceil(value / MARGIN_STEP) * MARGIN_STEP;
  return {
    margin: {
      top: step(margin.top),
      right: step(margin.right),
      bottom: step(margin.bottom),
      left: step(margin.left),
    },
    quality,
    shrink: { x: width * (1 - quality), y: height * (1 - quality) },
  };
};

/**
 * The box the scene is painted into: how far it hangs past the map area on
 * each side, and how small it is painted to hold the ground the camera is
 * looking at.
 *
 * Recomputed while the camera turns, but only when it has turned far enough to
 * matter: every change resizes both canvases and repaints the scene, so a
 * degree of pitch is the resolution and a gesture is only ever allowed to grow
 * the box and lower the quality. What it wants to give back is given back once
 * the map is at rest.
 */
export const usePlaneFit = (
  map: MaplibreMap | null,
  host: HTMLElement | null,
  inset: PlaneMargin,
  enabled: boolean,
  /** the drawing the box is sized to; see `fitFor` */
  getContent: () => PlaneContent | null = () => null,
  /** bumped when that drawing has moved enough to be worth measuring again */
  contentVersion = 0
): PlaneFit => {
  const [fit, setFit] = useState<PlaneFit>(NO_PLANE_FIT);
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const contentRef = useRef(getContent);
  contentRef.current = getContent;

  /**
   * The measurement, for the drawing to ask for one of its own. The map's own
   * events do not fire while a shape is dragged out past the edge of the box,
   * and that is exactly when the box has to grow.
   */
  const measureRef = useRef<(force: boolean) => void>(() => undefined);

  useEffect(() => {
    if (!host || !enabled) {
      setFit(NO_PLANE_FIT);
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
    let camera: PlaneMargin | null = null;
    const measure = (force: boolean) => {
      const area = areaOf();
      if (!area || area.width <= 0 || area.height <= 0) {
        return;
      }
      /**
       * The camera's own reach is kept until the camera's shape changes. It is
       * measured in map pixels, which a zoom scales along with everything
       * else, and it is taken from the middle of the area, which a pan carries
       * with it — so a pitch, a bearing and the size of the area are the whole
       * of what it depends on. It is also the expensive half: two dozen
       * unprojects against four cheap ones.
       */
      const next = map
        ? `${Math.round(map.getPitch())}|${Math.round(map.getBearing())}|${
            Math.round(area.width) + "x" + Math.round(area.height)
          }`
        : `${Math.round(area.width)}x${Math.round(area.height)}`;
      if (force || next !== key || !camera) {
        key = next;
        camera = map ? reachOf(map, area) : null;
      }
      /**
       * The drawing's reach is not scale free and not pan free: a zoom changes
       * how many map pixels it covers, a pan changes which edge it hangs past.
       * So it is asked for every time, and the box follows the drawing through
       * a gesture instead of waiting for the map to come to rest. Whether that
       * costs anything is `sameFit`'s answer, not this one's — margins move in
       * whole steps, so most frames end here.
       */
      const content = contentRef.current();
      // A drawing whose ground cannot be worked out falls back to the camera's
      // own reach, not to nothing: `null` here means "there is nothing out
      // there to cut", and answering that about a drawing we simply failed to
      // measure is the one way this can cut without ever recovering.
      const measured = map && content ? contentReach(map, area, content) : null;
      const drawn = content ? measured ?? camera : null;
      const wanted = fitFor(area, camera, drawn);
      planeLog("fit", {
        pitch: map?.getPitch() ?? null,
        bearing: map?.getBearing() ?? null,
        area,
        reach: camera,
        drawn,
        wanted,
        ratio: globalThis.devicePixelRatio || 1,
      });
      setFit((current) => {
        // a gesture may only grow the box and only lower the quality; giving
        // either back mid-tilt costs a canvas resize and a full repaint for
        // room we are about to want back
        const quality = moving
          ? Math.min(current.quality, wanted.quality)
          : wanted.quality;
        const merged: PlaneFit = moving
          ? {
              margin: {
                top: Math.max(current.margin.top, wanted.margin.top),
                right: Math.max(current.margin.right, wanted.margin.right),
                bottom: Math.max(current.margin.bottom, wanted.margin.bottom),
                left: Math.max(current.margin.left, wanted.margin.left),
              },
              quality,
              // the shrink is the quality's own, never the one it came with
              shrink: {
                x: area.width * (1 - quality),
                y: area.height * (1 - quality),
              },
            }
          : wanted;
        return sameFit(current, merged) ? current : merged;
      });
    };

    measure(true);
    measureRef.current = measure;
    const sizes = new ResizeObserver(() => measure(true));
    sizes.observe(host);

    if (!map) {
      return () => {
        sizes.disconnect();
        measureRef.current = () => undefined;
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
      measureRef.current = () => undefined;
      map.off("movestart", onStart);
      map.off("move", onMove);
      map.off("moveend", onRest);
    };
  }, [enabled, host, map]);

  // the drawing grew: the box is measured against it, so it is measured again.
  // Forced, because none of the keys the camera is watched by have moved
  useEffect(() => {
    measureRef.current(true);
  }, [contentVersion]);

  return fit;
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
     * The text editor is put where its anchor lands, but kept upright and at
     * the map's own scale: a textarea drawn through the matrix would be
     * skewed and foreshortened, and neither a skewed nor a four times too
     * small caret is something anyone can type into.
     *
     * Written as `translate` and `scale` rather than as `transform`, because
     * the editor's `transform` is excalidraw's own — it carries the element's
     * angle and the scene zoom there and rewrites it on every keystroke. The
     * individual properties apply outside it, so the two compose instead of
     * overwriting each other.
     *
     * Excalidraw scales the editor by the zoom the scene is painted at, which
     * on a tilted map is the map's scale brought down by the plane's quality,
     * so the editor comes out as small as the scene is painted — down to a
     * quarter. That much is given back, and no more: the quality is ours, an
     * answer to what a canvas costs, while the perspective is the drawing's
     * own and the glyphs on the canvas really are that size out there.
     *
     * Both properties are applied around the element's centre, the origin
     * excalidraw's transform is written for; the half-size term takes that
     * back out, so the scale lands on the anchor and not on the middle.
     */
    const written = new WeakMap<HTMLElement, string>();
    const billboard = (matrix: Mat3, quality: number) => {
      for (let index = 0; index < editors.length; index += 1) {
        const editor = editors[index];
        if (!(editor instanceof HTMLElement)) {
          continue;
        }
        const at = localOffset(editor, box);
        const to = at ? apply(matrix, at.x, at.y) : null;
        const scale = quality > 0 ? 1 / quality : 1;
        const shift = (scale - 1) / 2;
        const translate =
          at && to
            ? `${(to.x - at.x + shift * editor.offsetWidth).toFixed(2)}px ${(
                to.y -
                at.y +
                shift * editor.offsetHeight
              ).toFixed(2)}px`
            : "";
        const magnify = at && to ? scale.toFixed(4) : "";
        // compared against what was written, not against the style: the CSSOM
        // serialises these back normalised, so `scale` never reads as "1.0000"
        // and every frame would look like a change
        if (written.get(editor) !== `${translate} ${magnify}`) {
          written.set(editor, `${translate} ${magnify}`);
          editor.style.translate = translate;
          editor.style.scale = magnify;
        }
      }
    };

    /**
     * How small the scene is painted against the map, read back rather than
     * passed in: `camera.zoom` is the map's scale times the quality, and the
     * map's scale is what the anchor's zoom says it is. See `usePlaneFit`.
     */
    const qualityOf = (camera: PlaneCamera | null) => {
      if (!camera || !(camera.zoom > 0)) {
        return 1;
      }
      const scale = 2 ** (map.getZoom() - camera.anchor.zoom);
      return scale > 0 ? camera.zoom / scale : 1;
    };

    const clear = () => {
      write("none", "none");
      billboard(IDENTITY, 1);
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
      billboard(matrix, qualityOf(camera));
    };

    /**
     * The editor is a DOM box, so it is not carried by the canvas matrix but
     * placed by hand, and `tick` runs only while maplibre paints. An editor
     * opened on a map at rest would never be placed at all — it would sit
     * where the drawing was before the map was turned or tilted — and one
     * typed into is laid out again on every keystroke, so it is followed for
     * as long as it is open.
     *
     * The matrix is not solved again for this: what the map is doing is not
     * what changed, so the one the last tick left is the right one.
     */
    let frame = 0;
    const follow = () => {
      if (editors.length === 0) {
        frame = 0;
        return;
      }
      billboard(matrixRef.current, qualityOf(cameraRef.current));
      frame = requestAnimationFrame(follow);
    };
    const editing = new MutationObserver(() => {
      if (editors.length > 0 && frame === 0) {
        billboard(matrixRef.current, qualityOf(cameraRef.current));
        frame = requestAnimationFrame(follow);
      }
    });
    editing.observe(box, { childList: true, subtree: true });

    tick();
    map.on("render", tick);
    const sizes = new ResizeObserver(() => {
      map.triggerRepaint();
    });
    sizes.observe(box);
    return () => {
      map.off("render", tick);
      sizes.disconnect();
      editing.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
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
