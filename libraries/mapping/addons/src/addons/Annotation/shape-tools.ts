import { faCircle, faSquare } from "@fortawesome/free-regular-svg-icons";
import { faArrowPointer, faFont } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type AnnotationShape = "selection" | "rectangle" | "ellipse" | "text";

export const SHAPE_ICONS: Record<AnnotationShape, IconDefinition> = {
  selection: faArrowPointer,
  rectangle: faSquare,
  ellipse: faCircle,
  text: faFont,
};

export const SHAPE_LABELS: Record<AnnotationShape, string> = {
  selection: "Auswahl",
  rectangle: "Rechteck",
  ellipse: "Ellipse",
  text: "Text",
};

export const DEFAULT_SHAPES: AnnotationShape[] = [
  "selection",
  "rectangle",
  "ellipse",
  "text",
];

export const isAnnotationShape = (type: string): type is AnnotationShape =>
  type === "selection" ||
  type === "rectangle" ||
  type === "ellipse" ||
  type === "text";
