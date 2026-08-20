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
