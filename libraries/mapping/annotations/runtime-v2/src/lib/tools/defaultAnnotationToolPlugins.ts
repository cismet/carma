import type { AnnotationToolPlugin } from "./annotationToolPlugin.types";
import { distanceToolPlugin } from "./distance/distanceToolPlugin";
import { pointToolPlugin } from "./point/pointToolPlugin";
import { polylineToolPlugin } from "./polyline/polylineToolPlugin";
import { selectToolPlugin } from "./select/selectToolPlugin";
import { verticalAreaToolPlugin } from "./vertical-area/verticalAreaToolPlugin";

export const defaultAnnotationToolPlugins: readonly AnnotationToolPlugin[] = [
  selectToolPlugin,
  pointToolPlugin,
  distanceToolPlugin,
  polylineToolPlugin,
  verticalAreaToolPlugin,
];
