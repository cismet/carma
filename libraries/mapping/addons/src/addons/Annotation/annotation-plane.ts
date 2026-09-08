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
import { lngLatToScene } from "./annotation-scene-space";
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
 * The plane is larger than the map area — `PLANE_MARGIN` of it on each side —
 * so that a rotation has something to turn into the corners. The box is
 * clipped back to the map area in CSS, so the extra never covers the app's own
 * chrome and never takes a pointer event meant for it.
 */

/** how far the plane reaches past the map area, per side, of the area's size */
const PLANE_MARGIN = 0.5;

/** and never further than this on the ground, in map pixels */
const MAX_PLANE_MARGIN_PX = 1024;

/**
 * What the two excalidraw canvases may cost together, in device pixels. A
 * plane twice the size of the viewport is four times the canvas, which on a
 * large retina screen is hundreds of megabytes; past this the margin is given
 * back until it fits.
 */
const PLANE_DEVICE_PX_BUDGET = 24e6;

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

export type PlaneCamera = { scrollX: number; scrollY: number; zoom: number };

export type PlaneMargin = { x: number; y: number };

const NO_MARGIN: PlaneMargin = { x: 0, y: 0 };

const marginFor = (width: number, height: number): PlaneMargin => {
  if (width <= 0 || height <= 0) {
    return NO_MARGIN;
  }
  const ratio = globalThis.devicePixelRatio || 1;
  const wanted = {
    x: Math.min(width * PLANE_MARGIN, MAX_PLANE_MARGIN_PX),
    y: Math.min(height * PLANE_MARGIN, MAX_PLANE_MARGIN_PX),
  };
  let factor = 1;
  const cost = () =>
    (width + 2 * wanted.x * factor) *
    (height + 2 * wanted.y * factor) *
    ratio *
    ratio *
    2;
  while (factor > 0.05 && cost() > PLANE_DEVICE_PX_BUDGET) {
    factor *= 0.8;
  }
  return {
    x: Math.round(wanted.x * factor),
    y: Math.round(wanted.y * factor),
  };
};

/** how much the plane box hangs past the map area on each side */
export const usePlaneMargin = (
  host: HTMLElement | null,
  enabled: boolean
): PlaneMargin => {
  const [margin, setMargin] = useState<PlaneMargin>(NO_MARGIN);

  useEffect(() => {
    if (!host || !enabled) {
      setMargin(NO_MARGIN);
      return;
    }
    const measure = () => {
      const next = marginFor(host.clientWidth, host.clientHeight);
      setMargin((current) =>
        current.x === next.x && current.y === next.y ? current : next
      );
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(host);
    return () => {
      sizes.disconnect();
    };
  }, [enabled, host]);

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
  getAnchor: () => AnnotationAnchor | null;
  /** the camera excalidraw is actually rendering with, null until it is */
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
  getAnchor,
  getCamera,
  enabled,
}: UseGroundPlaneOptions): GroundPlane => {
  const matrixRef = useRef<Mat3>(IDENTITY);
  const inverseRef = useRef<Mat3>(IDENTITY);
  const cameraRef = useRef<PlaneCamera | null>(null);

  const anchorFn = useRef(getAnchor);
  anchorFn.current = getAnchor;
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
      const anchor = anchorFn.current();
      const camera = cameraFn.current();
      cameraRef.current = camera;
      if (!anchor || !camera || !(camera.zoom > 0)) {
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
        const scene = lngLatToScene(anchor, lngLat.lng, lngLat.lat);
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
        cssTransform(matrix),
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
