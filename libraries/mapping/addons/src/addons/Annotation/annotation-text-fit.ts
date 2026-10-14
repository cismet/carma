import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/types/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/types/data/transform";

/**
 * Lays a label out inside the shape it is bound to, by excalidraw's own
 * measurement.
 *
 * A label is wrapped and measured once, by whoever last changed it: the text
 * editor as it is typed into, and the style panel when a size is picked there.
 * The box that comes out of that is what the glyphs are drawn into and what
 * the text editor is sized from — so when a font size is read back as pixels
 * and written out in scene units (see `annotation-normalize`), the box is left
 * measured for a size the glyphs no longer have. The lines wrap in the wrong
 * places and the text stands outside the shape it belongs to.
 *
 * Measuring it again means excalidraw's own `redrawTextBoundingBox`, which is
 * not exported. What is exported is `convertToExcalidrawElements`, which runs
 * it: a shape skeleton carrying a label is wrapped, measured and positioned
 * exactly as the editor would do it, and the shape is grown where the label no
 * longer fits. So the layout is asked for by building the same shape and label
 * again, off to the side, and reading the numbers off the answer.
 *
 * Only the three shapes excalidraw centres a label in. An arrow's label is
 * placed by the linear editor from the line's midpoint, which this does not
 * stand in for.
 */
const FITTED = new Set(["rectangle", "ellipse", "diamond"]);

/** what the layout is asked about: a label's glyphs, and how they are set */
export type BoundTextSource = {
  originalText: string;
  fontSize: number;
  fontFamily: number;
  textAlign: string;
  verticalAlign: string;
  lineHeight: number;
};

/** the numbers a label and its shape come out of the layout with */
export type BoundTextFit = {
  label: {
    text: string;
    width: number;
    height: number;
    baseline: number;
    x: number;
    y: number;
  };
  /** the shape, which excalidraw grows where the label outgrew it */
  container: { width: number; height: number };
};

export const fitBoundText = (
  label: BoundTextSource,
  container: ExcalidrawElement
): BoundTextFit | null => {
  if (!FITTED.has(container.type) || !label.originalText) {
    return null;
  }
  const skeleton = {
    type: container.type,
    x: container.x,
    y: container.y,
    width: container.width,
    height: container.height,
    angle: container.angle,
    label: {
      text: label.originalText,
      fontSize: label.fontSize,
      fontFamily: label.fontFamily,
      textAlign: label.textAlign,
      verticalAlign: label.verticalAlign,
      // not in the skeleton's own type, and `newTextElement` takes it: the
      // measured height is the line height times the font size, so the line
      // height this label carries has to go in or the box comes back short
      lineHeight: label.lineHeight,
    },
    // the shape is a stand-in, so nothing but its geometry is described
  } as unknown as ExcalidrawElementSkeleton;

  let laid: readonly ExcalidrawElement[] = [];
  try {
    laid = convertToExcalidrawElements([skeleton]);
  } catch {
    // a shape excalidraw would not take is one this cannot answer for
    return null;
  }
  const text = laid.find(
    (element): element is ExcalidrawTextElement => element.type === "text"
  );
  const shape = laid.find((element) => element.type === container.type);
  if (!text || !shape) {
    return null;
  }
  return {
    label: {
      text: text.text,
      width: text.width,
      height: text.height,
      baseline: text.baseline,
      x: text.x,
      y: text.y,
    },
    container: { width: shape.width, height: shape.height },
  };
};

/**
 * A run of blanks left standing on the end of a line, which is what `wrapText`
 * leaves on every line but the last: it joins a line's words with a space and
 * pushes the line with that space still on it. See `trimHanging`.
 */
const HANGING = /[^\S\n]+(?=\n|$)/;

/** whether this element is a wrapped label with such a blank on it */
export const hangsBlank = (element: ExcalidrawElement): boolean => {
  const text = element as Partial<ExcalidrawTextElement>;
  return (
    element.type === "text" &&
    Boolean(text.containerId) &&
    typeof text.text === "string" &&
    // a label of nothing but blanks draws nothing either way, and excalidraw
    // reads an empty one as a label that is not there
    text.text.trim() !== "" &&
    HANGING.test(text.text)
  );
};

/**
 * The drawn lines with the blanks the wrap left hanging taken off their ends.
 *
 * The canvas centres the string it is handed, blanks and all, so a wrapped
 * line comes out half a space to the left of the box it is centred in. The
 * text editor is a textarea, and CSS hangs a blank at the end of a line rather
 * than counting it — so the same line is centred there on its glyphs alone.
 * That difference is the sideways jump every line but the last makes the
 * moment the editor opens on a label, and back again when it closes.
 *
 * Only what is drawn is trimmed. `originalText` is what the wrap is made from
 * and what the editor is filled with, and the measured box is what the editor
 * is laid out from: both are left as excalidraw made them, so the lines go on
 * breaking in the same places and the box goes on sitting where it sat.
 */
export const trimHanging = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+$/, ""))
    .join("\n");
