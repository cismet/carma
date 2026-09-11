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
