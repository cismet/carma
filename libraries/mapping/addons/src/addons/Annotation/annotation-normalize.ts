import { useCallback, useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types/types";

import {
  clipHidden,
  clipShown,
  clipWindow,
  clipCovers,
  isClipProxy,
  isClipped,
  oversized,
  proxiesFor,
  sameProxy,
} from "./annotation-clip";
import type { SceneRect } from "./annotation-clip";
import { planeLog } from "./annotation-plane-flag";
import { planeSceneRect } from "./annotation-scene-space";
import type { PlaneCamera } from "./annotation-plane";
import type { AnnotationAnchor } from "./types";

/**
 * Excalidraw keeps stroke width and font size in scene units and draws them at
 * `value * zoom`. On a map that means a line drawn on the city is a black bar
 * on the house, and a line drawn on the house is invisible on the city.
 *
 * So the two halves of a drawing are treated the way maplibre treats a
 * `symbol`: geometry is ground referenced, it sits on the map and scales with
 * it. Decoration is screen referenced — a 2 px line is 2 px wide at every
 * zoom, and 2 px is what the toolbar hands out whatever the map is showing.
 *
 * An image is neither, and is not touched at all. It is drawn over a place, so
 * it stays the size it was given and scales with the map like the ground does.
 *
 * Text is geometry too, for the same reason: a label belongs to the place it
 * was written on, so it grows and shrinks with the rectangle it names instead
 * of standing over the whole city once the map is zoomed out. Only the size
 * the style panel hands out is a pixel size — a font size picked there is read
 * as pixels once, at the zoom it was picked at, and the glyphs are ground
 * referenced from then on, exactly like a rectangle drawn at that size.
 *
 * The scene also has to stay inside excalidraw's own zoom clamp, 0.1 to 30, or
 * it renders the drawing at a scale the map is not at: wrong size, wrong
 * place, and a stroke that is off by whatever the clamp swallowed. A drawing
 * made on a house is six zoom levels from the city, so the clamp is reached
 * long before the two ends of a normal session are. What keeps it inside is
 * moving the anchor: scene units are map pixels at the anchor's zoom, so
 * handing the anchor a new zoom and multiplying every coordinate by the same
 * factor leaves the drawing exactly where it is on the ground and puts the
 * scene camera back at 1.
 *
 * Two things are rewritten for that. The elements, so what is already drawn
 * keeps its width, and the pen, so what is drawn next comes out at the width
 * the toolbar says. The pen is what makes the rewrite invisible: an element is
 * born in scene units that already render at the right pixel width, so nothing
 * jumps when the stroke is finished.
 *
 * For the elements the pixel value is canonical and lives in `customData`, the
 * field excalidraw reserves for the host app, so it survives save and load.
 * What the element carries is derived from it, and is only read back to notice
 * that the user changed it: `at` is the value we last wrote, so anything else
 * is the user's own choice. Elements can be read back like this because
 * `updateScene` puts them into the scene at once.
 *
 * The pen cannot. It lives in excalidraw's react state, which is a frame or
 * more behind what we last wrote, so reading it back during a zoom would keep
 * finding a value we do not recognise and mistake our own writing for the user
 * picking a size. The pen is therefore never read back: its pixel value is
 * ours, and the only thing taken from excalidraw is a value from the toolbar,
 * which is recognisable because the toolbar hands out nothing but its presets.
 */

/** the scale has to move by more than 2^K before a rewrite is worth its cost */
const K = 0.25;

/** below this the two numbers are the same number */
const EPSILON = 1e-6;

/** what the style panel can put into the pen, and nothing else can */
const STROKE_PRESETS = [1, 2, 4];
const FONT_PRESETS = [16, 20, 28, 36];
const ROUGHNESS_PRESETS = [0, 1, 2];

/** how many of our own pen writes stay recognisable in an element */
const PEN_MEMORY = 6;

/**
 * How far the scene camera may drift from 1 before the anchor is moved, in
 * zoom levels. Excalidraw clamps at 0.1 and 30, so there is room for more; two
 * levels keeps the numbers in the scene comfortable and the rewrites rare.
 */
const REBASE_LEVELS = 2;

/** a screen-referenced property: `px` on screen, `at` in scene units */
type Frozen = { px: number; at: number };

/** the pen for one property: its pixel size, and what we wrote it out as */
type PenSlot = { px: number | null; written: number[] };

type Pen = { stroke: PenSlot; font: PenSlot; roughness: PenSlot };

const emptySlot = (): PenSlot => ({ px: null, written: [] });

const isPreset = (value: number, presets: number[]) =>
  presets.some((preset) => Math.abs(value - preset) < EPSILON);

const storedFrozen = (value: unknown): Frozen | null => {
  const frozen = value as Frozen | null;
  return frozen &&
    typeof frozen.px === "number" &&
    typeof frozen.at === "number" &&
    Number.isFinite(frozen.px) &&
    Number.isFinite(frozen.at) &&
    frozen.px >= 0
    ? frozen
    : null;
};

/**
 * The canonical pixel size for one property of one element.
 *
 * A value we wrote ourselves says nothing new, so the pixel size stays. A
 * value the pen just handed out carries the pen's pixel size — including a
 * value from a pen write that has not reached excalidraw's state yet, which is
 * why more than the newest one counts. Anything else is the user setting a
 * size on the element itself, and the panel sets sizes in pixels.
 */
const freeze = (
  current: number,
  stored: unknown,
  scale: number,
  pen: PenSlot
): Frozen => {
  const previous = storedFrozen(stored);
  if (previous && Math.abs(current - previous.at) < EPSILON) {
    return { px: previous.px, at: previous.px / scale };
  }
  if (
    pen.px !== null &&
    pen.written.some((value) => Math.abs(current - value) < EPSILON)
  ) {
    return { px: pen.px, at: pen.px / scale };
  }
  return { px: current, at: current / scale };
};

/**
 * The scene font size of a text element, which is ground referenced: what it
 * carries is what it keeps, through every zoom.
 *
 * The one thing rewritten is a size the user just picked in the style panel.
 * The panel deals in pixels — 20 is "M" on screen, whatever the map is showing
 * — so such a value is divided by the scale once and is scene units from then
 * on. It is recognisable the same way the pen's values are: only the panel
 * hands out a preset, and only a value that is not the one we last saw on the
 * element can have come from the user at all.
 *
 * `at` is that last seen value; `px` is what it was on screen when it was
 * written, and is kept only so a stored size still reads like the frozen ones.
 */
const grounded = (
  current: number,
  stored: unknown,
  scale: number,
  panel: boolean
): Frozen => {
  const previous = storedFrozen(stored);
  if (previous && Math.abs(current - previous.at) < EPSILON) {
    return previous;
  }
  if (previous && panel && isPreset(current, FONT_PRESETS)) {
    return { px: current, at: current / scale };
  }
  return { px: current * scale, at: current };
};

const changed = (frozen: Frozen, stored: unknown) => {
  const previous = storedFrozen(stored);
  return (
    !previous ||
    Math.abs(previous.px - frozen.px) > EPSILON ||
    Math.abs(previous.at - frozen.at) > EPSILON
  );
};

type TextElement = ExcalidrawElement & {
  fontSize: number;
  textAlign: "left" | "center" | "right";
  /**
   * Where the glyphs sit in the box: excalidraw draws a line at `height -
   * baseline` from the top, so a font size rewritten without it puts the text
   * outside the box it is drawn into and the canvas cuts it off. It is a font
   * metric, so it scales with the glyphs.
   */
  baseline: number;
  containerId: string | null;
};

/** excalidraw skips an element whose version it has already drawn */
const redrawn = (element: ExcalidrawElement, patch: object) => ({
  ...element,
  ...patch,
  version: element.version + 1,
  versionNonce: Math.floor(Math.random() * 2 ** 31),
});

type Patch = Record<string, unknown>;

/**
 * The coordinates of one element read against an anchor `levels` zoom levels
 * further in, which is `factor` scene units per old unit. Nothing here changes
 * where the element sits on the ground or how big it is on screen.
 */
const rebased = (element: ExcalidrawElement, factor: number): Patch => {
  const patch: Patch = {
    x: element.x * factor,
    y: element.y * factor,
    width: element.width * factor,
    height: element.height * factor,
  };

  const shape = element as ExcalidrawElement & {
    points?: readonly (readonly number[])[];
    lastCommittedPoint?: readonly number[] | null;
    startBinding?: { gap?: number } | null;
    endBinding?: { gap?: number } | null;
  };
  if (Array.isArray(shape.points)) {
    patch.points = shape.points.map((point) => [
      point[0] * factor,
      point[1] * factor,
    ]);
  }
  if (Array.isArray(shape.lastCommittedPoint)) {
    patch.lastCommittedPoint = [
      shape.lastCommittedPoint[0] * factor,
      shape.lastCommittedPoint[1] * factor,
    ];
  }
  if (shape.startBinding && typeof shape.startBinding.gap === "number") {
    patch.startBinding = {
      ...shape.startBinding,
      gap: shape.startBinding.gap * factor,
    };
  }
  if (shape.endBinding && typeof shape.endBinding.gap === "number") {
    patch.endBinding = {
      ...shape.endBinding,
      gap: shape.endBinding.gap * factor,
    };
  }

  // the glyphs are geometry, so they are read in the new units like the box
  const text = element as Partial<TextElement>;
  if (element.type === "text" && typeof text.fontSize === "number") {
    patch.fontSize = text.fontSize * factor;
    if (typeof text.baseline === "number") {
      patch.baseline = text.baseline * factor;
    }
  }

  const roundness = element.roundness as {
    type: number;
    value?: number;
  } | null;
  if (roundness && typeof roundness.value === "number") {
    patch.roundness = { ...roundness, value: roundness.value * factor };
  }
  return patch;
};

/** the element's decoration rewritten for this scale, or null when it fits */
const rescaled = (
  element: ExcalidrawElement,
  scale: number,
  pen: Pen,
  busy: Set<string>,
  /** scene units per old unit when the anchor moves in the same pass, else 1 */
  factor: number
): Patch | null => {
  // an image is left exactly as it is, in both its size and its frame
  if (element.type === "image") {
    return null;
  }
  // the element under the hand: rewriting it takes the text editor apart
  // around the caret, and moves a shape out from under the pointer
  if (busy.has(element.id)) {
    return null;
  }

  const data = (element.customData ?? {}) as Record<string, unknown>;
  const patch: Record<string, number> = {};
  const customData: Record<string, unknown> = { ...data };
  let dirty = false;

  const stroke = freeze(
    element.strokeWidth,
    data.strokeNorm,
    scale,
    pen.stroke
  );
  customData.strokeNorm = stroke;
  dirty = dirty || changed(stroke, data.strokeNorm);
  if (Math.abs(element.strokeWidth - stroke.at) > EPSILON) {
    patch.strokeWidth = stroke.at;
  }

  // rough.js wobbles by `roughness` scene units, so a hand-drawn line drawn
  // over a city block is a scribble over a house
  const rough = freeze(element.roughness, data.roughNorm, scale, pen.roughness);
  customData.roughNorm = rough;
  dirty = dirty || changed(rough, data.roughNorm);
  if (Math.abs(element.roughness - rough.at) > EPSILON) {
    patch.roughness = rough.at;
  }

  if (element.type === "text") {
    const text = element as TextElement;
    // read in the units the element is about to be in, so a rebase in the
    // same pass is not mistaken for the user picking a size
    const current = text.fontSize * factor;
    const font = grounded(current, data.fontNorm, scale, factor === 1);
    customData.fontNorm = font;
    dirty = dirty || changed(font, data.fontNorm);
    if (Math.abs(current - font.at) > EPSILON && current > EPSILON) {
      const ratio = font.at / current;
      patch.fontSize = font.at;
      patch.baseline = text.baseline * factor * ratio;
      // the measured box goes with the glyphs. A text bound to a container is
      // laid out by excalidraw itself, so its box is left alone
      if (!text.containerId) {
        const width = text.width * factor;
        const height = text.height * factor;
        patch.width = width * ratio;
        patch.height = height * ratio;
        // A resized text is held the way excalidraw holds one, in
        // `offsetElementAfterFontResize`: the vertical middle stays put and
        // the horizontal edge the text is aligned to does. The style panel has
        // just done this for the size it set, and this pass sets another one
        // on top of it — leaving the box where it is instead would walk the
        // text up the map a step per click.
        patch.y = text.y * factor + (height - patch.height) / 2;
        if (text.textAlign !== "left") {
          patch.x =
            text.x * factor +
            (width - patch.width) / (text.textAlign === "center" ? 2 : 1);
        }
      }
    }
  }

  if (!dirty && Object.keys(patch).length === 0) {
    return null;
  }
  return { ...patch, customData };
};

export type UseDecorationScaleOptions = {
  api: ExcalidrawImperativeAPI | null;
  libreMap: MaplibreMap | null;
  /** the scene's own element, where a finished gesture is noticed */
  overlay: HTMLElement | null;
  /** the ground point the scene hangs from; scene units are its map pixels */
  getAnchor: () => AnnotationAnchor | null;
  /** moves the anchor to another zoom, leaving it where it is on the ground */
  setAnchorZoom: (zoom: number) => void;
  /**
   * The camera the scene is really painted with, where there is a ground
   * plane, and the anchor that camera counts from. Everything here is measured
   * against what is on the canvas, never against where the map happens to be:
   * the two are the same number only at rest, and a pass that reads the map
   * mid-gesture rewrites the drawing for a scale it is not being drawn at.
   * Left out, the map's own zoom is the camera — which is what it is with the
   * plane switched off.
   */
  getCamera?: () => PlaneCamera | null;
};

/**
 * Keeps the decoration at its pixel size. Driven by the map's `zoom`, never by
 * `move`: panning changes no scale, so it must cost nothing. A forced pass
 * runs when a gesture ends, which is where a new element gets its pixel size,
 * and on a drawing restored from storage.
 *
 * Returns the pass, so the scene can force one when its saved elements have
 * landed, and `noteState`, which the scene feeds every state excalidraw
 * reports: it is where a size picked in the style panel is picked up, and
 * where the element currently under the hand is learned.
 */
export const useDecorationScale = ({
  api,
  libreMap,
  overlay,
  getAnchor,
  setAnchorZoom,
  getCamera,
}: UseDecorationScaleOptions) => {
  const scaleRef = useRef(0);
  const penRef = useRef<Pen>({
    stroke: emptySlot(),
    font: emptySlot(),
    roughness: emptySlot(),
  });

  const busyRef = useRef<{ ids: Set<string>; editing: boolean }>({
    ids: new Set(),
    editing: false,
  });

  /** the window the copies were clipped to, null while there are none */
  const clipRef = useRef<SceneRect | null>(null);

  /**
   * The plane in scene units, read at `scale`. With a ground plane that is the
   * box the scene is painted into, taken straight from the camera it is
   * painted with — where the map is standing right now says nothing about it.
   * Without one it is what is on screen, measured from the anchor.
   */
  const viewportRect = useCallback(
    (scale: number): SceneRect | null => {
      const camera = getCamera?.();
      if (!camera) {
        return planeSceneRect(libreMap, overlay, getAnchor(), scale);
      }
      if (
        !overlay ||
        camera.anchor !== getAnchor() ||
        !(scale > 0) ||
        !(camera.zoom > 0)
      ) {
        return null;
      }
      const box = overlay.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        return null;
      }
      // a rebase reads the same box in smaller units, by the same factor the
      // elements are rewritten with
      const factor = camera.zoom / scale;
      return {
        minX: -camera.scrollX * factor,
        minY: -camera.scrollY * factor,
        maxX: (box.width / camera.zoom - camera.scrollX) * factor,
        maxY: (box.height / camera.zoom - camera.scrollY) * factor,
      };
    },
    [getAnchor, getCamera, libreMap, overlay]
  );

  /**
   * The two scales, which are the same number only while the map is at rest.
   *
   * `painted` is what the canvas was drawn at: the scene's own camera. It is
   * what everything about the canvas is measured against — the box the drawing
   * is painted into, whether an element is too big for excalidraw to draw, and
   * how far the camera has drifted from 1.
   *
   * `screen` is what the drawing is *seen* at, the map's own scale. The plane
   * matrix scales the canvas by `screen / painted`, so a stroke arrives on the
   * screen at `strokeWidth * painted * (screen / painted)` — the painted
   * camera cancels and the width the eye gets is `strokeWidth * screen`.
   * Decoration is therefore divided by this one and never by the painted
   * camera: dividing by the painted camera leaves every stroke `screen /
   * painted` out for the length of a gesture, bold zooming one way and thin
   * the other.
   *
   * Null while the scene is still drawn against an anchor the drawing has
   * moved past — a coordinate does not mean the same thing in the two of them,
   * so there is nothing to measure yet.
   */
  const scalesNow = useCallback((): {
    painted: number;
    screen: number;
  } | null => {
    const anchor = getAnchor();
    if (!libreMap || !anchor) {
      return null;
    }
    const screen = 2 ** (libreMap.getZoom() - anchor.zoom);
    const camera = getCamera?.();
    if (!camera) {
      return { painted: screen, screen };
    }
    return camera.anchor === anchor ? { painted: camera.zoom, screen } : null;
  }, [getAnchor, getCamera, libreMap]);

  /** the scale of the canvas itself, for everything measured against it */
  const paintedScale = useCallback(
    (): number | null => scalesNow()?.painted ?? null,
    [scalesNow]
  );

  const noteState = useCallback((state: AppState) => {
    // excalidraw's own state, so this is what it really has right now
    const ids = new Set<string>();
    if (state.editingElement) {
      ids.add(state.editingElement.id);
    }
    if (state.draggingElement) {
      ids.add(state.draggingElement.id);
    }
    if (state.editingLinearElement) {
      ids.add(state.editingLinearElement.elementId);
    }
    busyRef.current = { ids, editing: Boolean(state.editingElement) };

    const pen = penRef.current;
    // only a preset can be the user: everything else in there is our own
    if (isPreset(state.currentItemStrokeWidth, STROKE_PRESETS)) {
      pen.stroke.px = state.currentItemStrokeWidth;
    }
    if (isPreset(state.currentItemFontSize, FONT_PRESETS)) {
      pen.font.px = state.currentItemFontSize;
    }
    if (isPreset(state.currentItemRoughness, ROUGHNESS_PRESETS)) {
      pen.roughness.px = state.currentItemRoughness;
    }
  }, []);

  const normalize = useCallback(
    (force: boolean) => {
      const anchor = getAnchor();
      if (!api || !libreMap || !anchor) {
        return;
      }
      const scales = scalesNow();
      if (!scales || !(scales.painted > 0) || !(scales.screen > 0)) {
        const seen = getCamera?.();
        planeLog("normalize skipped", {
          force,
          anchorZoom: anchor.zoom,
          cameraAnchorZoom: seen?.anchor.zoom ?? null,
          cameraZoom: seen?.zoom ?? null,
        });
        return;
      }
      const { painted, screen } = scales;
      // the decoration is what drifts while the map moves, so it is what says
      // whether the pass is worth its cost
      const moved =
        scaleRef.current <= 0 ||
        Math.abs(Math.log2(screen / scaleRef.current)) >= K;
      if (!force && !moved) {
        return;
      }
      const busy = busyRef.current.ids;

      // Far enough out that excalidraw would clamp its own camera: the anchor
      // moves to this zoom and the drawing is read against it instead. Never
      // while the hand is on an element, which would be rewritten under it.
      const rebasing =
        busy.size === 0 && Math.abs(Math.log2(painted)) >= REBASE_LEVELS;
      // a rebase reads every coordinate in units `painted` times smaller, so
      // both scales are read in those units from here on
      const geometry = rebasing ? 1 : painted;
      const scale = rebasing ? screen / painted : screen;
      scaleRef.current = scale;

      // the pen first: what it hands out is what a new element is born with,
      // and an element carrying exactly that is one the pen just made
      const pen = penRef.current;
      const wanted = (slot: PenSlot) =>
        slot.px === null ? null : slot.px / scale;
      const write = (slot: PenSlot, value: number | null) => {
        if (
          value === null ||
          Math.abs((slot.written[0] ?? NaN) - value) < EPSILON
        ) {
          return false;
        }
        slot.written = [value, ...slot.written].slice(0, PEN_MEMORY);
        return true;
      };
      const strokeAt = wanted(pen.stroke);
      const fontAt = wanted(pen.font);
      const roughAt = wanted(pen.roughness);
      // the open text editor reads the pen as it types, so it is left alone
      const penMoved =
        !busyRef.current.editing &&
        [
          write(pen.stroke, strokeAt),
          write(pen.font, fontAt),
          write(pen.roughness, roughAt),
        ].some(Boolean);

      let touched = false;
      // including the deleted ones: updateScene replaces the whole array, and
      // dropping them here would take the redo of a deletion with it. The
      // copies are not the drawing and are made again further down
      const scene = api.getSceneElementsIncludingDeleted();
      const spare = new Map(
        scene.filter(isClipProxy).map((proxy) => [proxy.id, proxy])
      );
      const rewritten = scene
        .filter((element) => !isClipProxy(element))
        .map((element) => {
          const moved = rebasing ? rebased(element, painted) : null;
          const decoration = rescaled(
            element,
            scale,
            pen,
            busy,
            rebasing ? painted : 1
          );
          if (!moved && !decoration) {
            return element;
          }
          touched = true;
          return redrawn(element, {
            ...(moved ?? {}),
            ...(decoration ?? {}),
          }) as ExcalidrawElement;
        });

      // What excalidraw's canvas cap would eat is drawn by clipped copies
      // instead, see `annotation-clip`. The element under the hand keeps
      // drawing itself: it is being moved, and its copies would lag it.
      const viewport = viewportRect(geometry);
      const clipBox = viewport ? clipWindow(viewport) : null;
      const pixelRatio = globalThis.devicePixelRatio || 1;
      const elements: ExcalidrawElement[] = [];
      const copies = new Set<string>();
      rewritten.forEach((element) => {
        const takeOver =
          clipBox !== null &&
          !busy.has(element.id) &&
          oversized(element, geometry, pixelRatio);
        if (!takeOver) {
          if (!isClipped(element)) {
            elements.push(element);
            return;
          }
          touched = true;
          elements.push(redrawn(clipShown(element), {}) as ExcalidrawElement);
          return;
        }
        if (isClipped(element)) {
          elements.push(element);
        } else {
          touched = true;
          elements.push(redrawn(clipHidden(element), {}) as ExcalidrawElement);
        }
        proxiesFor(element, clipBox, geometry).forEach((proxy) => {
          copies.add(proxy.id);
          const previous = spare.get(proxy.id);
          // the same copy as last time keeps its version, so excalidraw draws
          // it from its cache instead of making it again
          if (previous && sameProxy(previous, proxy)) {
            elements.push(previous);
            return;
          }
          touched = true;
          elements.push(proxy);
        });
      });
      if (spare.size !== copies.size) {
        touched = true;
      }
      // a copy only covers the window it was clipped to, so panning past that
      // window has to make them again; nothing to watch while there are none
      clipRef.current = copies.size > 0 ? clipBox : null;

      const sample = elements.find(
        (element) => !element.isDeleted && !isClipProxy(element)
      );
      planeLog("normalize", {
        force,
        mapZoom: libreMap.getZoom(),
        anchorZoom: anchor.zoom,
        painted,
        screen,
        rebasing,
        geometry,
        decoration: scale,
        penPx: pen.stroke.px,
        strokeWidth: sample?.strokeWidth ?? null,
        strokeNorm: (sample?.customData as { strokeNorm?: unknown } | undefined)
          ?.strokeNorm,
        touched,
        penMoved,
      });

      if (!touched && !penMoved) {
        return;
      }
      if (rebasing) {
        // before the elements land, so the camera for the new anchor is what
        // the scene draws them with. Read off the painted camera, not the map:
        // the zoom that puts this scale at 1 is the one the scene is at
        setAnchorZoom(anchor.zoom + Math.log2(painted));
      }
      // not an edit the user made, so it stays out of the undo history
      api.updateScene({
        elements: touched ? elements : undefined,
        appState: penMoved
          ? {
              currentItemStrokeWidth: (strokeAt ??
                undefined) as AppState["currentItemStrokeWidth"],
              currentItemFontSize: (fontAt ??
                undefined) as AppState["currentItemFontSize"],
              currentItemRoughness: (roughAt ??
                undefined) as AppState["currentItemRoughness"],
            }
          : undefined,
        commitToHistory: false,
      });
    },
    [
      api,
      getAnchor,
      getCamera,
      libreMap,
      scalesNow,
      setAnchorZoom,
      viewportRect,
    ]
  );

  /**
   * Panning changes no scale, so it costs nothing here, but it does move the
   * window the copies were clipped to. They are made again once the map has
   * left it, and never while there are no copies to begin with.
   */
  useEffect(() => {
    if (!api || !libreMap) {
      return;
    }
    const onMove = () => {
      const clipped = clipRef.current;
      const scale = paintedScale();
      if (!clipped || scale === null) {
        return;
      }
      const viewport = viewportRect(scale);
      if (!viewport || clipCovers(clipped, viewport)) {
        return;
      }
      normalize(true);
    };
    libreMap.on("move", onMove);
    return () => {
      libreMap.off("move", onMove);
    };
  }, [api, libreMap, normalize, paintedScale, viewportRect]);

  useEffect(() => {
    if (!api || !libreMap) {
      return;
    }
    normalize(true);
    const onZoom = () => normalize(false);
    libreMap.on("zoom", onZoom);
    return () => {
      libreMap.off("zoom", onZoom);
    };
  }, [api, libreMap, normalize]);

  useEffect(() => {
    if (!overlay) {
      return;
    }
    // a frame later: excalidraw finishes the gesture after this handler, and
    // the element it was drawing is only free to be rewritten once it has
    const onUp = () =>
      requestAnimationFrame(() => requestAnimationFrame(() => normalize(true)));
    overlay.addEventListener("pointerup", onUp, true);
    // a stroke may well be let go somewhere else entirely
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      overlay.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [normalize, overlay]);

  return { normalize, noteState };
};
