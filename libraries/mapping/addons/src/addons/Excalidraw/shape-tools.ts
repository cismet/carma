import { faCircle, faSquare } from "@fortawesome/free-regular-svg-icons";
import { faArrowPointer } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type ExcalidrawShape = "selection" | "rectangle" | "ellipse";

export const SHAPE_ICONS: Record<ExcalidrawShape, IconDefinition> = {
  selection: faArrowPointer,
  rectangle: faSquare,
  ellipse: faCircle,
};

export const SHAPE_LABELS: Record<ExcalidrawShape, string> = {
  selection: "Auswahl",
  rectangle: "Rechteck",
  ellipse: "Ellipse",
};

export const DEFAULT_SHAPES: ExcalidrawShape[] = [
  "selection",
  "rectangle",
  "ellipse",
];

export const isExcalidrawShape = (type: string): type is ExcalidrawShape =>
  type === "selection" || type === "rectangle" || type === "ellipse";
