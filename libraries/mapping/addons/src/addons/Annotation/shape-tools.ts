import { faCircle, faSquare } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowPointer,
  faArrowRight,
  faFont,
  faSlash,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type AnnotationShape =
  | "selection"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "line"
  | "text";

export const SHAPE_ICONS: Record<AnnotationShape, IconDefinition> = {
  selection: faArrowPointer,
  rectangle: faSquare,
  ellipse: faCircle,
  arrow: faArrowRight,
  line: faSlash,
  text: faFont,
};

export const SHAPE_LABELS: Record<AnnotationShape, string> = {
  selection: "Auswahl",
  rectangle: "Rechteck",
  ellipse: "Ellipse",
  arrow: "Pfeil",
  line: "Linie",
  text: "Text",
};

export const DEFAULT_SHAPES: AnnotationShape[] = [
  "selection",
  "rectangle",
  "ellipse",
  "arrow",
  "line",
  "text",
];

export const isAnnotationShape = (type: string): type is AnnotationShape =>
  type === "selection" ||
  type === "rectangle" ||
  type === "ellipse" ||
  type === "arrow" ||
  type === "line" ||
  type === "text";
