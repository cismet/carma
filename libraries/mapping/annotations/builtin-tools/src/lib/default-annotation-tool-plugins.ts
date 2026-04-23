import type { AnnotationToolPlugin } from "@carma-mapping/annotations/runtime";
import { areaGroundToolPlugin } from "./area-ground/area-ground-tool-plugin";
import { areaPlanarToolPlugin } from "./area-planar/area-planar-tool-plugin";
import { distanceToolPlugin } from "./distance/distance-tool-plugin";
import {
  createLabelToolPlugin,
  labelToolPlugin,
  type LabelToolPluginOptions,
} from "./label/label-tool-plugin";
import { pointToolPlugin } from "./point/point-tool-plugin";
import { polylineToolPlugin } from "./polyline/polyline-tool-plugin";
import { selectToolPlugin } from "./select/select-tool-plugin";
import { verticalAreaToolPlugin } from "./vertical-area/vertical-area-tool-plugin";
export type DefaultAnnotationToolPluginsOptions = {
  label?: LabelToolPluginOptions;
};

export const createDefaultAnnotationToolPlugins = ({
  label,
}: DefaultAnnotationToolPluginsOptions = {}): readonly AnnotationToolPlugin[] => [
  selectToolPlugin,
  pointToolPlugin,
  distanceToolPlugin,
  polylineToolPlugin,
  areaGroundToolPlugin,
  areaPlanarToolPlugin,
  verticalAreaToolPlugin,
  label ? createLabelToolPlugin(label) : labelToolPlugin,
];

export const defaultAnnotationToolPlugins = createDefaultAnnotationToolPlugins();
