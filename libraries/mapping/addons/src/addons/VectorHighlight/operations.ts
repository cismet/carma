import {
  faCircleHalfStroke,
  faCrop,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type HighlightOperation = "add" | "subtract" | "intersect" | "invert";

export const OPERATION_LABELS: Record<HighlightOperation, string> = {
  add: "Hinzufügen",
  subtract: "Abziehen",
  intersect: "Schneiden",
  invert: "Invertieren",
};

export const OPERATION_ICONS: Record<HighlightOperation, IconDefinition> = {
  add: faPlus,
  subtract: faMinus,
  intersect: faCrop,
  invert: faCircleHalfStroke,
};

/** colour a button gets while its operation is the active one; matches the
 *  colour the lasso itself draws in */
export const OPERATION_COLORS: Record<HighlightOperation, string> = {
  add: "#22c55e",
  subtract: "#ec4899",
  intersect: "#f97316",
  invert: "#3388ff",
};

/** the blue every operation falls back to when colours are switched off */
export const MONOCHROME_COLOR = "#3388ff";

/** size per glyph, so the thin plus and minus do not read smaller than the
 *  filled circle and the crop frame */
export const OPERATION_ICON_SIZES: Record<HighlightOperation, string> = {
  add: "0.875rem",
  subtract: "0.875rem",
  intersect: "0.8125rem",
  invert: "0.8125rem",
};

/** order the operation toolbar offers them in */
export const OPERATIONS: HighlightOperation[] = [
  "add",
  "subtract",
  "invert",
  "intersect",
];
