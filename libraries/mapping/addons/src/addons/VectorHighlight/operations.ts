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
  add: "#3388ff",
  subtract: "#3388ff",
  intersect: "#f97316",
  invert: "#3388ff",
};
