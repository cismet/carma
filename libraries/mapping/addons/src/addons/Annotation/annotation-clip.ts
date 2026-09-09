import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";

/**
 * Excalidraw draws every element into a canvas of its own that covers the
 * element's whole bounding box, and it caps that canvas:
 * `cappedElementCanvasSize` in its `renderElement.ts` keeps the canvas inside
 * 32767 px per side and 16777216 px of area. Past the cap the element is
 * painted at a reduced scale and blown back up, so a 2 px stroke is drawn as a
 * fraction of a pixel and comes back as grey crumbs.
 *
 * On a map that is reached early. The area limit counts device pixels, so on a
 * retina screen it is spent once an element covers about 2048 by 2048 CSS
 * pixels, which a shape drawn over the city passes two zoom levels above where
 * it was drawn. Nothing on our side can avoid it: the cap is a function of the
 * element's size on screen, which is what the map says it is.
 *
 * So an oversized element is left in the scene exactly as it is, at full size
 * and with its id, and only its rendering is taken over: it is made invisible
 * (opacity 0, the value it had parked in `customData`) and the part of it that
 * is on screen is drawn by copies, its outline clipped to the viewport plus a
 * margin, as plain line elements. A copy is the size of the viewport, so the
 * cache never caps and the stroke keeps the width it was given.
 *
 * The original keeps its geometry, its place in the scene and its hit box, so
 * selecting, dragging, undo and storage all still see what they always saw.
 * The copies carry `customData.clipOf` and are dropped from everything that
 * leaves the scene, see `unclipped`, and from the scene itself as soon as the
 * element fits again.
 *
 * A copy is geometry only. Three things do not survive it: a rounded corner is
 * cut square, because the outline is sampled from the box rather than from
 * excalidraw's own path; a hand-drawn shape gets its wobble from rough.js over
 * the clipped points, so the wobble is not the same wobble; and an arrowhead
 * is kept only when the end it belongs to is on screen.
 */

/** a box in scene units */
export type SceneRect = { minX: number; minY: number; maxX: number; maxY: number };

type Point = [number, number];

/** excalidraw's own limits, from `cappedElementCanvasSize` */
const AREA_LIMIT = 16777216;
const WIDTH_HEIGHT_LIMIT = 32767;

/**
 * How much of the cap an element may spend before it is drawn by copies. At 1
 * it would be taken over the moment excalidraw shaves anything off, which is
 * also the moment the loss is still invisible, so a little is left to it.
 */
const DEGRADED = 0.9;

/** how far past the viewport a copy reaches, per side, of the viewport's size */
const MARGIN = 0.5;

/** the sampled outline of a curve: one point per this many screen pixels */
const SAMPLE_PX = 8;
const MIN_SAMPLES = 64;
const MAX_SAMPLES = 2048;

/** below this the two coordinates are the same coordinate */
const EPSILON = 1e-6;

type Shape = ExcalidrawElement & {
  points?: readonly (readonly number[])[];
  startArrowhead?: unknown;
  endArrowhead?: unknown;
};

type ClipData = { clipOf?: string; clipHash?: number; clipOpacity?: number };

const dataOf = (element: ExcalidrawElement): ClipData =>
  (element.customData ?? {}) as ClipData;

/** a copy standing in for an element too big for excalidraw to draw */
export const isClipProxy = (element: ExcalidrawElement) =>
  typeof dataOf(element).clipOf === "string";

/** the opacity the element has when it is drawing itself */
const visibleOpacity = (element: ExcalidrawElement) => {
  const parked = dataOf(element).clipOpacity;
  return typeof parked === "number" ? parked : element.opacity;
};

/** whether this element is hidden behind copies right now */
export const isClipped = (element: ExcalidrawElement) =>
  typeof dataOf(element).clipOpacity === "number";

/** `customData` without the fields the clipping put there */
const withoutClipData = (element: ExcalidrawElement) => {
  const { clipOpacity, ...rest } = dataOf(element);
  void clipOpacity;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

/**
 * The scene as everything outside the renderer wants it: no copies, and every
 * element back at the opacity the user gave it. What storage saves, what the
 * zoom-to-drawing measures.
 */
export const unclipped = (
  elements: readonly ExcalidrawElement[]
): readonly ExcalidrawElement[] => {
  if (!elements.some((element) => isClipProxy(element) || isClipped(element))) {
    return elements;
  }
  return elements
    .filter((element) => !isClipProxy(element))
    .map((element) =>
      isClipped(element)
        ? ({
            ...element,
            opacity: visibleOpacity(element),
            customData: withoutClipData(element),
          } as ExcalidrawElement)
        : element
    );
};

/** the element with its rendering taken over, or given back */
export const clipHidden = (element: ExcalidrawElement) =>
  ({
    ...element,
    opacity: 0,
    customData: { ...dataOf(element), clipOpacity: visibleOpacity(element) },
  } as ExcalidrawElement);

export const clipShown = (element: ExcalidrawElement) =>
  ({
    ...element,
    opacity: visibleOpacity(element),
    customData: withoutClipData(element),
  } as ExcalidrawElement);

/** excalidraw pads the element canvas by this much, see its getCanvasPadding */
const canvasPadding = (element: ExcalidrawElement) =>
  element.type === "freedraw" ? element.strokeWidth * 12 : 20;

/**
 * The scale excalidraw would really draw this element at, given the scene
 * camera. Below the camera means the cap has bitten and the element is being
 * drawn smaller than it is shown, which is what eats the stroke.
 */
const renderScaleOf = (
  element: ExcalidrawElement,
  camera: number,
  pixelRatio: number
) => {
  const padding = canvasPadding(element);
  const width = Math.abs(element.width) * pixelRatio + padding * 2;
  const height = Math.abs(element.height) * pixelRatio + padding * 2;
  let scale = camera;
  if (width * scale > WIDTH_HEIGHT_LIMIT || height * scale > WIDTH_HEIGHT_LIMIT) {
    scale = Math.min(WIDTH_HEIGHT_LIMIT / width, WIDTH_HEIGHT_LIMIT / height);
  }
  if (width * height * scale * scale > AREA_LIMIT) {
    scale = Math.sqrt(AREA_LIMIT / (width * height));
  }
  return scale;
};

/** the types a copy can be made of; text keeps its size, an image is untouched */
const CLIPPABLE = new Set(["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw"]);

/** whether excalidraw is losing this element's stroke to its canvas cap */
export const oversized = (
  element: ExcalidrawElement,
  camera: number,
  pixelRatio: number
) =>
  !element.isDeleted &&
  CLIPPABLE.has(element.type) &&
  renderScaleOf(element, camera, pixelRatio) < camera * DEGRADED;

/** the viewport with the margin a copy is allowed to reach into */
export const clipWindow = (viewport: SceneRect): SceneRect => {
  const width = viewport.maxX - viewport.minX;
  const height = viewport.maxY - viewport.minY;
  return {
    minX: viewport.minX - width * MARGIN,
    minY: viewport.minY - height * MARGIN,
    maxX: viewport.maxX + width * MARGIN,
    maxY: viewport.maxY + height * MARGIN,
  };
};

/** whether the copies made for `window` still cover `viewport` */
export const clipCovers = (window: SceneRect, viewport: SceneRect) =>
  viewport.minX >= window.minX &&
  viewport.minY >= window.minY &&
  viewport.maxX <= window.maxX &&
  viewport.maxY <= window.maxY;

const rotated = (point: Point, cx: number, cy: number, angle: number): Point => {
  if (!angle) {
    return point;
  }
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const dx = point[0] - cx;
  const dy = point[1] - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
};

const samples = (perimeter: number) =>
  Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.ceil(perimeter / SAMPLE_PX)));

type Outline = { points: Point[]; closed: boolean };

/** the element's own shape as a polyline in scene coordinates, rotation applied */
const outlineOf = (element: ExcalidrawElement, camera: number): Outline | null => {
  const { x, y, width, height, angle } = element;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const turn = (points: Point[]) =>
    points.map((point) => rotated(point, cx, cy, angle));

  if (element.type === "rectangle") {
    return {
      points: turn([
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ]),
      closed: true,
    };
  }
  if (element.type === "diamond") {
    return {
      points: turn([
        [cx, y],
        [x + width, cy],
        [cx, y + height],
        [x, cy],
      ]),
      closed: true,
    };
  }
  if (element.type === "ellipse") {
    const rx = width / 2;
    const ry = height / 2;
    const count = samples((Math.abs(width) + Math.abs(height)) * camera * 1.6);
    const points: Point[] = [];
    for (let index = 0; index < count; index += 1) {
      const step = (index / count) * Math.PI * 2;
      points.push([cx + rx * Math.cos(step), cy + ry * Math.sin(step)]);
    }
    return { points: turn(points), closed: true };
  }

  const shape = element as Shape;
  if (!Array.isArray(shape.points) || shape.points.length < 2) {
    return null;
  }
  const points = turn(
    shape.points.map((point) => [x + point[0], y + point[1]] as Point)
  );
  const first = points[0];
  const last = points[points.length - 1];
  const closed =
    element.type !== "freedraw" &&
    points.length > 2 &&
    Math.abs(first[0] - last[0]) < EPSILON &&
    Math.abs(first[1] - last[1]) < EPSILON;
  return { points: closed ? points.slice(0, -1) : points, closed };
};

const OUT_LEFT = 1;
const OUT_RIGHT = 2;
const OUT_TOP = 4;
const OUT_BOTTOM = 8;

const codeOf = (x: number, y: number, rect: SceneRect) => {
  let code = 0;
  if (x < rect.minX) {
    code |= OUT_LEFT;
  } else if (x > rect.maxX) {
    code |= OUT_RIGHT;
  }
  if (y < rect.minY) {
    code |= OUT_TOP;
  } else if (y > rect.maxY) {
    code |= OUT_BOTTOM;
  }
  return code;
};

/** Cohen and Sutherland: the part of the segment inside the box, if any */
const clipSegment = (a: Point, b: Point, rect: SceneRect): [Point, Point] | null => {
  let [x0, y0] = a;
  let [x1, y1] = b;
  let code0 = codeOf(x0, y0, rect);
  let code1 = codeOf(x1, y1, rect);
  for (let guard = 0; guard < 8; guard += 1) {
    if (!(code0 | code1)) {
      return [
        [x0, y0],
        [x1, y1],
      ];
    }
    if (code0 & code1) {
      return null;
    }
    const code = code0 || code1;
    let x = 0;
    let y = 0;
    if (code & OUT_TOP) {
      x = x0 + ((x1 - x0) * (rect.minY - y0)) / (y1 - y0);
      y = rect.minY;
    } else if (code & OUT_BOTTOM) {
      x = x0 + ((x1 - x0) * (rect.maxY - y0)) / (y1 - y0);
      y = rect.maxY;
    } else if (code & OUT_RIGHT) {
      y = y0 + ((y1 - y0) * (rect.maxX - x0)) / (x1 - x0);
      x = rect.maxX;
    } else {
      y = y0 + ((y1 - y0) * (rect.minX - x0)) / (x1 - x0);
      x = rect.minX;
    }
    if (code === code0) {
      x0 = x;
      y0 = y;
      code0 = codeOf(x0, y0, rect);
    } else {
      x1 = x;
      y1 = y;
      code1 = codeOf(x1, y1, rect);
    }
  }
  return null;
};

/**
 * The polyline broken into the runs of it that are inside the box. An open run
 * per crossing, so nothing is ever drawn along the edge of the box the way a
 * polygon clip would.
 */
const clipPolyline = (points: Point[], rect: SceneRect): Point[][] => {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const piece = clipSegment(points[index], points[index + 1], rect);
    if (!piece) {
      if (run.length > 1) {
        runs.push(run);
      }
      run = [];
      continue;
    }
    const [from, to] = piece;
    const end = run[run.length - 1];
    if (
      end &&
      Math.abs(end[0] - from[0]) < EPSILON &&
      Math.abs(end[1] - from[1]) < EPSILON
    ) {
      run.push(to);
    } else {
      if (run.length > 1) {
        runs.push(run);
      }
      run = [from, to];
    }
  }
  if (run.length > 1) {
    runs.push(run);
  }
  return runs;
};

type Edge = typeof OUT_LEFT | typeof OUT_RIGHT | typeof OUT_TOP | typeof OUT_BOTTOM;

const insideEdge = (point: Point, edge: Edge, rect: SceneRect) => {
  switch (edge) {
    case OUT_LEFT:
      return point[0] >= rect.minX;
    case OUT_RIGHT:
      return point[0] <= rect.maxX;
    case OUT_TOP:
      return point[1] >= rect.minY;
    default:
      return point[1] <= rect.maxY;
  }
};

const crossEdge = (a: Point, b: Point, edge: Edge, rect: SceneRect): Point => {
  if (edge === OUT_LEFT || edge === OUT_RIGHT) {
    const x = edge === OUT_LEFT ? rect.minX : rect.maxX;
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + (b[1] - a[1]) * t];
  }
  const y = edge === OUT_TOP ? rect.minY : rect.maxY;
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0] - a[0]) * t, y];
};

/**
 * Sutherland and Hodgman: the part of the closed shape inside the box, as a
 * closed shape. Only for a fill, since the edges it lays along the box are not
 * the shape's own outline.
 */
const clipPolygon = (points: Point[], rect: SceneRect): Point[] => {
  let output = points;
  ([OUT_LEFT, OUT_RIGHT, OUT_TOP, OUT_BOTTOM] as Edge[]).forEach((edge) => {
    const input = output;
    output = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      const currentIn = insideEdge(current, edge, rect);
      const previousIn = insideEdge(previous, edge, rect);
      if (currentIn) {
        if (!previousIn) {
          output.push(crossEdge(previous, current, edge, rect));
        }
        output.push(current);
      } else if (previousIn) {
        output.push(crossEdge(previous, current, edge, rect));
      }
    }
  });
  return output;
};

/** what makes two copies of the same element the same copy, cheaply */
const hashOf = (points: Point[]) => {
  let hash = 2166136261;
  points.forEach((point) => {
    hash = Math.imul(hash ^ Math.round(point[0] * 10), 16777619);
    hash = Math.imul(hash ^ Math.round(point[1] * 10), 16777619);
  });
  return hash >>> 0;
};

const extent = (values: number[]) =>
  values.reduce(
    (box, value) => ({
      min: Math.min(box.min, value),
      max: Math.max(box.max, value),
    }),
    { min: Infinity, max: -Infinity }
  );

type ProxyStyle = {
  strokeColor: string;
  backgroundColor: string;
  startArrowhead: unknown;
  endArrowhead: unknown;
};

const proxyElement = (
  source: ExcalidrawElement,
  id: string,
  points: Point[],
  style: ProxyStyle
): ExcalidrawElement => {
  const [originX, originY] = points[0];
  const local = points.map(
    (point) => [point[0] - originX, point[1] - originY] as Point
  );
  const horizontal = extent(local.map((point) => point[0]));
  const vertical = extent(local.map((point) => point[1]));
  return {
    id,
    type: "line",
    x: originX,
    y: originY,
    width: horizontal.max - horizontal.min,
    height: vertical.max - vertical.min,
    angle: 0,
    points: local,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: style.startArrowhead,
    endArrowhead: style.endArrowhead,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: source.fillStyle,
    strokeWidth: source.strokeWidth,
    strokeStyle: source.strokeStyle,
    roughness: source.roughness,
    opacity: visibleOpacity(source),
    seed: source.seed,
    roundness: null,
    groupIds: [],
    boundElements: null,
    frameId: null,
    link: null,
    // not the user's to select, move or delete: it is a rendering of something
    // else, and it is thrown away and made again on the next zoom
    locked: true,
    isDeleted: false,
    updated: Date.now(),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    customData: { clipOf: source.id, clipHash: hashOf(points) },
  } as unknown as ExcalidrawElement;
};

const samePoint = (a: Point, b: Point) =>
  Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;

/**
 * The copies that draw this element inside `window`. Empty when none of it is
 * in there, which is its own answer: nothing of it is on screen.
 *
 * A filled shape gets two, because a polygon clip lays edges along the window
 * that the outline does not have: one closed shape carrying the fill and no
 * stroke, and the clipped outline over it carrying the stroke and no fill.
 */
export const proxiesFor = (
  element: ExcalidrawElement,
  window: SceneRect,
  camera: number
): ExcalidrawElement[] => {
  const outline = outlineOf(element, camera);
  if (!outline) {
    return [];
  }
  const proxies: ExcalidrawElement[] = [];
  const shape = element as Shape;

  const filled = outline.closed && element.backgroundColor !== "transparent";
  if (filled) {
    const polygon = clipPolygon(outline.points, window);
    if (polygon.length > 2) {
      proxies.push(
        proxyElement(element, `${element.id}~fill`, [...polygon, polygon[0]], {
          strokeColor: "transparent",
          backgroundColor: element.backgroundColor,
          startArrowhead: null,
          endArrowhead: null,
        })
      );
    }
  }

  const path = outline.closed
    ? [...outline.points, outline.points[0]]
    : outline.points;
  const first = path[0];
  const last = path[path.length - 1];
  clipPolyline(path, window).forEach((run, index) => {
    proxies.push(
      proxyElement(element, `${element.id}~clip${index}`, run, {
        strokeColor: element.strokeColor,
        backgroundColor: "transparent",
        // an arrowhead belongs to an end, and only survives with it
        startArrowhead: samePoint(run[0], first)
          ? shape.startArrowhead ?? null
          : null,
        endArrowhead: samePoint(run[run.length - 1], last)
          ? shape.endArrowhead ?? null
          : null,
      })
    );
  });
  return proxies;
};

/**
 * Whether the scene holds copies that no longer match the drawing: undo and
 * redo put back element arrays that were captured while copies existed, so a
 * copy can come back without the element it stands for, or over an element
 * that is drawing itself again. Both are wrong on screen until a pass runs.
 *
 * An element hidden with no copies is not one of those: it is an element that
 * is off screen entirely, and panning back to it makes them.
 */
export const staleProxies = (elements: readonly ExcalidrawElement[]) => {
  const sources = new Map<string, ExcalidrawElement>();
  elements.forEach((element) => {
    if (!isClipProxy(element)) {
      sources.set(element.id, element);
    }
  });
  return elements.some((element) => {
    const source = dataOf(element).clipOf;
    if (source === undefined) {
      return false;
    }
    const drawn = sources.get(source);
    return !drawn || !isClipped(drawn);
  });
};

/**
 * The scene with every copy taken out and every element drawing itself again,
 * or null when there is none in there. Undo and redo hand back an element
 * array that was captured while copies existed, which stand for a camera and
 * an anchor that are no longer the ones in use; the pass that follows makes
 * the copies this camera needs. The versions are bumped because excalidraw
 * skips an element at a version it has already drawn.
 */
export const dropProxies = (
  elements: readonly ExcalidrawElement[]
): ExcalidrawElement[] | null => {
  if (!elements.some((element) => isClipProxy(element) || isClipped(element))) {
    return null;
  }
  return elements
    .filter((element) => !isClipProxy(element))
    .map((element) =>
      isClipped(element)
        ? ({
            ...clipShown(element),
            version: element.version + 1,
            versionNonce: Math.floor(Math.random() * 2 ** 31),
          } as ExcalidrawElement)
        : element
    );
};

/** whether the copy that is there already is the copy we would make now */
export const sameProxy = (a: ExcalidrawElement, b: ExcalidrawElement) =>
  dataOf(a).clipHash === dataOf(b).clipHash &&
  a.strokeColor === b.strokeColor &&
  a.backgroundColor === b.backgroundColor &&
  a.strokeWidth === b.strokeWidth &&
  a.strokeStyle === b.strokeStyle &&
  a.roughness === b.roughness &&
  a.opacity === b.opacity;
