import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";

/**
 * Excalidraw draws an arrowhead at a size that is a constant in its renderer,
 * in scene units: 30 for the two barbs of an arrow, 15 for a bar, a dot or a
 * triangle, clamped to half of what the head sits on. On a map that number is
 * read at whatever scale the drawing is being seen at, so the same head is
 * 120 px two zoom levels above the anchor and 7 px two levels below it — a
 * blot on the one end of a session and nothing at all on the other, while the
 * line it belongs to keeps the width the toolbar gave it. Moving the anchor
 * makes it jump: a rebase multiplies every coordinate, and the head, which is
 * not a coordinate, stays the size it was.
 *
 * A head is decoration, so it belongs on the screen-referenced side of
 * `annotation-normalize`: drawn at the size excalidraw draws it at 100 %, at
 * every zoom. Excalidraw cannot be told that. The size is not a property of
 * the element, and the one part of the calculation an element can reach — the
 * clamp against the segment the head sits on — only ever makes a head smaller
 * than that constant, never larger.
 *
 * So the head is taken over the way an oversized outline is, see
 * `annotation-clip`: the value the user picked is parked in `customData`, the
 * element itself carries no head, and the head is drawn by a locked copy that
 * is made again whenever the scale moves. The copy is geometry only and is
 * dropped from everything that leaves the scene, where the parked value goes
 * back on the element, so what is saved is an ordinary excalidraw arrow.
 *
 * Two things follow from the element carrying none. Excalidraw's style panel
 * reads the head off the selection and falls back to the pen when the
 * selection has none, so it shows the pen's head rather than the element's:
 * the same thing for every drawing whose arrows were drawn with one pen, which
 * is nearly all of them. And a head picked *away* in that panel writes the
 * same null the parking writes, so it cannot be read off the element at all —
 * it is noticed in the pen instead, see `noteState` in `annotation-normalize`.
 */

export type Arrowhead = "arrow" | "bar" | "dot" | "triangle";

export type ArrowheadEnd = "start" | "end";

/** the heads of one element, as the user picked them */
export type Heads = { start: Arrowhead | null; end: Arrowhead | null };

type Point = [number, number];

type Shape = ExcalidrawElement & {
  points?: readonly (readonly number[])[];
  startArrowhead?: unknown;
  endArrowhead?: unknown;
};

type HeadData = {
  headNorm?: Heads;
  headOf?: string;
  headHash?: number;
};

/** the pixel sizes excalidraw's own `getArrowheadPoints` draws a head at */
const HEAD_PX: Record<Arrowhead, number> = {
  arrow: 30,
  bar: 15,
  dot: 15,
  triangle: 15,
};

/** and the angle it stands the head off the line at, in degrees */
const HEAD_ANGLE: Record<Arrowhead, number> = {
  arrow: 20,
  bar: 90,
  dot: 0,
  triangle: 25,
};

/** below this the two lengths are the same length */
const EPSILON = 1e-6;

const dataOf = (element: ExcalidrawElement): HeadData =>
  (element.customData ?? {}) as HeadData;

const isArrowhead = (value: unknown): value is Arrowhead =>
  value === "arrow" ||
  value === "bar" ||
  value === "dot" ||
  value === "triangle";

/** a locked copy that draws one end's head */
export const isHeadProxy = (element: ExcalidrawElement) =>
  typeof dataOf(element).headOf === "string";

/** the element the copy draws a head for */
export const headSource = (element: ExcalidrawElement) =>
  dataOf(element).headOf;

/** the heads the user picked, kept off the element so it draws none itself */
export const parkedHeads = (element: ExcalidrawElement): Heads | null => {
  const parked = dataOf(element).headNorm;
  if (!parked || typeof parked !== "object") {
    return null;
  }
  const start = isArrowhead(parked.start) ? parked.start : null;
  const end = isArrowhead(parked.end) ? parked.end : null;
  return start || end ? { start, end } : null;
};

/**
 * The head the element carries moved into `customData`, or null when it
 * carries none — which is every element a pass has already been over, and
 * every one that never had a head. A pick in the style panel puts one back on
 * the element, and that is where it is read from: what is not on the element
 * is what was parked, so the two are merged rather than replaced.
 */
export const parkHeads = (
  element: ExcalidrawElement
): Record<string, unknown> | null => {
  const shape = element as Shape;
  const start = isArrowhead(shape.startArrowhead) ? shape.startArrowhead : null;
  const end = isArrowhead(shape.endArrowhead) ? shape.endArrowhead : null;
  if (!start && !end) {
    return null;
  }
  const parked = parkedHeads(element);
  return {
    startArrowhead: null,
    endArrowhead: null,
    customData: {
      ...dataOf(element),
      headNorm: {
        start: start ?? parked?.start ?? null,
        end: end ?? parked?.end ?? null,
      },
    },
  };
};

/**
 * The element with the named ends' heads taken away, for a head picked away in
 * the style panel. Null when it has none of them, so a pick that changes
 * nothing rewrites nothing.
 */
export const dropHeads = (
  element: ExcalidrawElement,
  ends: { start?: boolean; end?: boolean }
): Record<string, unknown> | null => {
  const parked = parkedHeads(element);
  if (!parked || !((ends.start && parked.start) || (ends.end && parked.end))) {
    return null;
  }
  const kept: Heads = {
    start: ends.start ? null : parked.start,
    end: ends.end ? null : parked.end,
  };
  return {
    startArrowhead: null,
    endArrowhead: null,
    customData: {
      ...dataOf(element),
      headNorm: kept.start || kept.end ? kept : undefined,
    },
  };
};

/**
 * The element with its head back on it, the way everything outside the
 * renderer wants it: what storage saves, and what an export hands to any other
 * excalidraw.
 */
export const headsRestored = (
  element: ExcalidrawElement
): ExcalidrawElement => {
  const parked = parkedHeads(element);
  if (!parked) {
    return element;
  }
  const { headNorm, ...rest } = dataOf(element);
  void headNorm;
  return {
    ...element,
    startArrowhead: parked.start,
    endArrowhead: parked.end,
    customData: Object.keys(rest).length > 0 ? rest : undefined,
  } as ExcalidrawElement;
};

const rotate = (point: Point, cx: number, cy: number, angle: number): Point => {
  if (!angle) {
    return point;
  }
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const dx = point[0] - cx;
  const dy = point[1] - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
};

/** one end of a line in scene coordinates: its tip, and what runs into it */
const endOf = (element: ExcalidrawElement, at: ArrowheadEnd) => {
  const shape = element as Shape;
  const points = shape.points;
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const absolute = points.map((point) =>
    rotate(
      [element.x + point[0], element.y + point[1]] as Point,
      cx,
      cy,
      element.angle
    )
  );
  const tip = at === "start" ? absolute[0] : absolute[absolute.length - 1];
  const next = at === "start" ? absolute[1] : absolute[absolute.length - 2];
  let total = 0;
  for (let index = 1; index < absolute.length; index += 1) {
    total += Math.hypot(
      absolute[index][0] - absolute[index - 1][0],
      absolute[index][1] - absolute[index - 1][1]
    );
  }
  return {
    tip,
    segment: Math.hypot(tip[0] - next[0], tip[1] - next[1]),
    total,
    direction: [tip[0] - next[0], tip[1] - next[1]] as Point,
  };
};

const hashOf = (values: number[]) => {
  let hash = 2166136261;
  values.forEach((value) => {
    hash = Math.imul(hash ^ Math.round(value * 100), 16777619);
  });
  return hash >>> 0;
};

const proxyOf = (
  source: ExcalidrawElement,
  at: ArrowheadEnd,
  opacity: number,
  hash: number,
  shape: Record<string, unknown>
): ExcalidrawElement =>
  ({
    id: `${source.id}~head-${at}`,
    angle: 0,
    fillStyle: "solid",
    strokeWidth: source.strokeWidth,
    // excalidraw draws a head solid whatever the line does, except a dotted
    // line, which gets a dotted cap; this is that rule
    strokeStyle: source.strokeStyle === "dotted" ? "dotted" : "solid",
    roughness: source.roughness,
    opacity,
    seed: source.seed,
    roundness: null,
    groupIds: [],
    boundElements: null,
    frameId: null,
    link: null,
    // not the user's to select, move or delete: it is a rendering of a
    // property of something else, made again on the next zoom
    locked: true,
    isDeleted: false,
    updated: Date.now(),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    ...shape,
    customData: { headOf: source.id, headHash: hash },
  } as unknown as ExcalidrawElement);

const extent = (values: number[]) => ({
  min: Math.min(...values),
  max: Math.max(...values),
});

/** a head made of straight runs: the barbs of an arrow, a bar, a triangle */
const strokedProxy = (
  source: ExcalidrawElement,
  at: ArrowheadEnd,
  head: Arrowhead,
  opacity: number,
  points: Point[],
  hash: number
) => {
  const [originX, originY] = points[0];
  const local = points.map(
    (point) => [point[0] - originX, point[1] - originY] as Point
  );
  const horizontal = extent(local.map((point) => point[0]));
  const vertical = extent(local.map((point) => point[1]));
  const filled = head === "triangle";
  return proxyOf(source, at, opacity, hash, {
    type: "line",
    x: originX,
    y: originY,
    width: horizontal.max - horizontal.min,
    height: vertical.max - vertical.min,
    points: local,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    strokeColor: source.strokeColor,
    backgroundColor: filled ? source.strokeColor : "transparent",
  });
};

/**
 * The copies that draw one element's heads at `scale` screen pixels per scene
 * unit. Empty when it has none, or when there is no line to hang one off.
 */
export const headProxiesFor = (
  element: ExcalidrawElement,
  scale: number,
  opacity: number
): ExcalidrawElement[] => {
  const parked = parkedHeads(element);
  if (!parked || element.isDeleted || !(scale > 0)) {
    return [];
  }
  const proxies: ExcalidrawElement[] = [];
  (["start", "end"] as ArrowheadEnd[]).forEach((at) => {
    const head = parked[at];
    if (!head) {
      return;
    }
    const end = endOf(element, at);
    if (!end || !(end.segment > EPSILON)) {
      return;
    }
    const nx = end.direction[0] / end.segment;
    const ny = end.direction[1] / end.segment;
    // excalidraw's own clamp, so a head never takes more than half of what it
    // sits on: the segment it stands on for barbs, the whole line for the rest
    const reach = head === "arrow" ? end.segment : end.total;
    const size = Math.min(HEAD_PX[head] / scale, reach / 2);
    if (!(size > EPSILON)) {
      return;
    }
    const [tipX, tipY] = end.tip;
    const hash = hashOf([
      tipX,
      tipY,
      nx,
      ny,
      size,
      element.strokeWidth,
      element.roughness,
      opacity,
      HEAD_PX[head],
    ]);

    if (head === "dot") {
      // rough draws the dot from a diameter, and excalidraw hands it the head
      // size plus the stroke — a dot is as fat as the line it ends
      const diameter = size + element.strokeWidth;
      proxies.push(
        proxyOf(element, at, opacity, hash, {
          type: "ellipse",
          x: tipX - diameter / 2,
          y: tipY - diameter / 2,
          width: diameter,
          height: diameter,
          strokeColor: "transparent",
          backgroundColor: element.strokeColor,
        })
      );
      return;
    }

    const angle = (HEAD_ANGLE[head] * Math.PI) / 180;
    const back: Point = [tipX - nx * size, tipY - ny * size];
    const left = rotate(back, tipX, tipY, -angle);
    const right = rotate(back, tipX, tipY, angle);
    const points: Point[] =
      head === "bar"
        ? [left, right]
        : head === "triangle"
        ? [left, end.tip, right, left]
        : [left, end.tip, right];
    proxies.push(strokedProxy(element, at, head, opacity, points, hash));
  });
  return proxies;
};

/** whether the copy that is there already is the copy we would make now */
export const sameHeadProxy = (a: ExcalidrawElement, b: ExcalidrawElement) =>
  dataOf(a).headHash === dataOf(b).headHash &&
  a.strokeColor === b.strokeColor &&
  a.backgroundColor === b.backgroundColor &&
  a.strokeStyle === b.strokeStyle;
