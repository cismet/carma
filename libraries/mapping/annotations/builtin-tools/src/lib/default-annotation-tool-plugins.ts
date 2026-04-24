import type { AnnotationToolPlugin } from "@carma-mapping/annotations/runtime";
import type {
  AreaOcclusionStyleOptions,
  MeasurementLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import {
  areaGroundToolPlugin,
  createAreaGroundToolPlugin,
} from "./area-ground/area-ground-tool-plugin";
import {
  areaPlanarToolPlugin,
  createAreaPlanarToolPlugin,
} from "./area-planar/area-planar-tool-plugin";
import {
  createDistanceToolPlugin,
  distanceToolPlugin,
} from "./distance/distance-tool-plugin";
import {
  createLabelToolPlugin,
  labelToolPlugin,
  type LabelToolPluginOptions,
} from "./label/label-tool-plugin";
import { pointToolPlugin } from "./point/point-tool-plugin";
import {
  createPolylineToolPlugin,
  polylineToolPlugin,
} from "./polyline/polyline-tool-plugin";
import { selectToolPlugin } from "./select/select-tool-plugin";
import {
  createVerticalAreaToolPlugin,
  verticalAreaToolPlugin,
} from "./vertical-area/vertical-area-tool-plugin";
export type DefaultAnnotationToolPluginsOptions = {
  label?: LabelToolPluginOptions;
  areaOcclusionStyle?: AreaOcclusionStyleOptions;
  measurementLineStyle?: MeasurementLineStyleOptions;
};

export const createDefaultAnnotationToolPlugins = ({
  label,
  areaOcclusionStyle,
  measurementLineStyle,
}: DefaultAnnotationToolPluginsOptions = {}): readonly AnnotationToolPlugin[] => {
  const hasMeasurementLineStyle = measurementLineStyle !== undefined;

  return [
    selectToolPlugin,
    pointToolPlugin,
    hasMeasurementLineStyle
      ? createDistanceToolPlugin({
          measurementLineStyleOptions: measurementLineStyle,
        })
      : distanceToolPlugin,
    hasMeasurementLineStyle
      ? createPolylineToolPlugin({
          measurementLineStyleOptions: measurementLineStyle,
        })
      : polylineToolPlugin,
    areaOcclusionStyle || hasMeasurementLineStyle
      ? createAreaGroundToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          measurementLineStyleOptions: measurementLineStyle,
        })
      : areaGroundToolPlugin,
    areaOcclusionStyle || hasMeasurementLineStyle
      ? createAreaPlanarToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          measurementLineStyleOptions: measurementLineStyle,
        })
      : areaPlanarToolPlugin,
    areaOcclusionStyle || hasMeasurementLineStyle
      ? createVerticalAreaToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          measurementLineStyleOptions: measurementLineStyle,
        })
      : verticalAreaToolPlugin,
    label ? createLabelToolPlugin(label) : labelToolPlugin,
  ];
};

export const defaultAnnotationToolPlugins =
  createDefaultAnnotationToolPlugins();
