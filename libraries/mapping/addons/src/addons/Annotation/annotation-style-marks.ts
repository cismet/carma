import { useCallback, useRef } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";

import { fontPixels, strokePixels } from "./annotation-normalize";

/**
 * Excalidraw's style panel marks the button whose number the element carries.
 * The element carries scene units — the size read on the map — while the size
 * the user picked is a pixel size, kept in `customData`. The two are the same
 * number only where the drawing reads 100 %, so the panel usually marks
 * nothing and a text that has a size looks like a text that has none.
 *
 * So the mark is put on by hand, with the panel's own class, on the button for
 * the size the selection really has. It is a mark and nothing else: what the
 * buttons do when they are pressed is excalidraw's, and untouched. Excalidraw
 * rewrites the class whenever it renders that row with a different value of
 * its own, which is a change it reports — and every report marks again.
 */

/** below this the two sizes are the same size */
const EPSILON = 1e-6;

type Button = { id: string; px: number };

type Pen = { stroke: number | null; font: number | null };

type Row = {
  buttons: Button[];
  /** the pixel size this row shows for one element, if it shows one at all */
  pixels: (element: ExcalidrawElement, pen: Pen) => number | null;
};

/** the panel's font size row; the presets are excalidraw's own */
const FONT_ROW: Row = {
  buttons: [
    { id: "fontSize-small", px: 16 },
    { id: "fontSize-medium", px: 20 },
    { id: "fontSize-large", px: 28 },
    { id: "fontSize-veryLarge", px: 36 },
  ],
  // an element no pass has seen yet is one still carrying what the pen drew it
  // with, and the pen's size is a pixel size already
  pixels: (element, pen) =>
    element.type === "text" ? fontPixels(element) ?? pen.font : null,
};

/** the same for stroke width, which is a pixel size for the same reason */
const STROKE_ROW: Row = {
  buttons: [
    { id: "strokeWidth-thin", px: 1 },
    { id: "strokeWidth-bold", px: 2 },
    { id: "strokeWidth-extraBold", px: 4 },
  ],
  pixels: (element, pen) =>
    element.type === "text" ? null : strokePixels(element) ?? pen.stroke,
};

/**
 * What the panel is showing: the selection, plus the label inside a selected
 * shape, which is what the font row is about when a shape is selected. While a
 * text is being typed it is the only thing the panel is about, selected or
 * not.
 */
const shownElements = (
  api: ExcalidrawImperativeAPI
): readonly ExcalidrawElement[] => {
  const state = api.getAppState();
  const scene = api.getSceneElements();
  const ids = new Set<string>();
  scene.forEach((element) => {
    if (state.selectedElementIds[element.id]) {
      ids.add(element.id);
      (element.boundElements ?? []).forEach((bound) => {
        if (bound.type === "text") {
          ids.add(bound.id);
        }
      });
    }
  });
  if (state.editingElement) {
    ids.add(state.editingElement.id);
  }
  return scene.filter((element) => ids.has(element.id));
};

/** the one size a row stands for, or null where there is nothing to agree on */
const agreed = (elements: readonly ExcalidrawElement[], row: Row, pen: Pen) => {
  let size: number | null = null;
  for (const element of elements) {
    const px = row.pixels(element, pen);
    if (px === null) {
      continue;
    }
    if (size === null) {
      size = px;
    } else if (Math.abs(size - px) > EPSILON) {
      // a mixed selection: excalidraw marks nothing here either
      return null;
    }
  }
  return size;
};

const mark = (root: HTMLElement, row: Row, size: number | null) => {
  row.buttons.forEach((button) => {
    // the panel's own markup: a radio inside the label that carries the class
    const input = root.querySelector(`input[data-testid="${button.id}"]`);
    const label = input?.closest("label");
    if (!label) {
      return;
    }
    label.classList.toggle(
      "active",
      size !== null && Math.abs(size - button.px) < EPSILON
    );
  });
};

export type UseStyleMarksOptions = {
  api: ExcalidrawImperativeAPI | null;
  /** the scene's own element, which the panel is rendered inside */
  overlay: HTMLElement | null;
  /** the sizes the pen holds, which is what an empty selection shows */
  penPixels: () => { stroke: number | null; font: number | null };
};

/**
 * Returns the marking pass. The scene calls it on every change excalidraw
 * reports; the work is put off to the next frame, where the panel excalidraw
 * is about to render is the one that gets marked.
 */
export const useStyleMarks = ({
  api,
  overlay,
  penPixels,
}: UseStyleMarksOptions) => {
  const askedRef = useRef(false);

  return useCallback(() => {
    if (askedRef.current || !api || !overlay) {
      return;
    }
    askedRef.current = true;
    requestAnimationFrame(() => {
      askedRef.current = false;
      const elements = shownElements(api);
      const pen = penPixels();
      const hasSelection = elements.length > 0;
      mark(
        overlay,
        FONT_ROW,
        hasSelection ? agreed(elements, FONT_ROW, pen) : pen.font
      );
      mark(
        overlay,
        STROKE_ROW,
        hasSelection ? agreed(elements, STROKE_ROW, pen) : pen.stroke
      );
    });
  }, [api, overlay, penPixels]);
};
