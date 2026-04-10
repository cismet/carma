import type { AnnotationToolPlugin } from "./annotationToolPlugin.types";
import { areaGroundToolPlugin } from "./area-ground/areaGroundToolPlugin";
import { areaPlanarToolPlugin } from "./area-planar/areaPlanarToolPlugin";
import { distanceToolPlugin } from "./distance/distanceToolPlugin";
import { labelToolPlugin } from "./label/labelToolPlugin";
import { pointToolPlugin } from "./point/pointToolPlugin";
import { polylineToolPlugin } from "./polyline/polylineToolPlugin";
import { selectToolPlugin } from "./select/selectToolPlugin";
import { verticalAreaToolPlugin } from "./vertical-area/verticalAreaToolPlugin";
export const defaultAnnotationToolPlugins: readonly AnnotationToolPlugin[] = [
  selectToolPlugin,
  pointToolPlugin,
  distanceToolPlugin,
  polylineToolPlugin,
  areaGroundToolPlugin,
  areaPlanarToolPlugin,
  verticalAreaToolPlugin,
  labelToolPlugin,
];
