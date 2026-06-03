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
  areaPlanarBiggestTriangleToolPlugin,
  areaPlanarPcaToolPlugin,
  areaPlanarToolPlugin,
  areaPlanarTrapezoidToolPlugin,
  createAreaPlanarBiggestTriangleToolPlugin,
  createAreaPlanarPcaToolPlugin,
  createAreaPlanarToolPlugin,
  createAreaPlanarTrapezoidToolPlugin,
} from "./area-planar/area-planar-tool-plugin";
import {
  createDistanceToolPlugin,
  distanceToolPlugin,
} from "./distance/distance-tool-plugin";
import {
  createLabelToolPlugin,
  labelToolPlugin,
} from "./label/label-tool-plugin";
import {
  createPointToolPlugin,
  pointToolPlugin,
} from "./point/point-tool-plugin";
import {
  createPolylineToolPlugin,
  polylineToolPlugin,
} from "./polyline/polyline-tool-plugin";
import {
  createSelectToolPlugin,
  selectToolPlugin,
} from "./select/select-tool-plugin";
import {
  createVerticalAreaToolPlugin,
  verticalAreaToolPlugin,
} from "./vertical-area/vertical-area-tool-plugin";
import type { DefaultAnnotationToolTexts } from "./annotation-mode-text";

export type DefaultAnnotationToolPluginsOptions = {
  areaOcclusionStyle?: AreaOcclusionStyleOptions;
  areaPlanarMaxPlaneNormalChangeDeg?: number | null;
  measurementLineStyle?: MeasurementLineStyleOptions;
  texts?: DefaultAnnotationToolTexts;
};

export const createDefaultAnnotationToolPlugins = ({
  areaOcclusionStyle,
  areaPlanarMaxPlaneNormalChangeDeg,
  measurementLineStyle,
  texts,
}: DefaultAnnotationToolPluginsOptions = {}): readonly AnnotationToolPlugin[] => {
  const hasMeasurementLineStyle = measurementLineStyle !== undefined;
  const hasAreaPlanarNormalChangeLimit =
    areaPlanarMaxPlaneNormalChangeDeg !== undefined;
  const hasCustomTexts = texts !== undefined;

  return [
    hasCustomTexts ? createSelectToolPlugin({ texts }) : selectToolPlugin,
    hasCustomTexts ? createPointToolPlugin({ texts }) : pointToolPlugin,
    hasMeasurementLineStyle || hasCustomTexts
      ? createDistanceToolPlugin({
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : distanceToolPlugin,
    hasMeasurementLineStyle || hasCustomTexts
      ? createPolylineToolPlugin({
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : polylineToolPlugin,
    areaOcclusionStyle || hasMeasurementLineStyle || hasCustomTexts
      ? createAreaGroundToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : areaGroundToolPlugin,
    areaOcclusionStyle ||
    hasMeasurementLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : areaPlanarToolPlugin,
    areaOcclusionStyle ||
    hasMeasurementLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarBiggestTriangleToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : areaPlanarBiggestTriangleToolPlugin,
    areaOcclusionStyle ||
    hasMeasurementLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarPcaToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : areaPlanarPcaToolPlugin,
    areaOcclusionStyle ||
    hasMeasurementLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarTrapezoidToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : areaPlanarTrapezoidToolPlugin,
    areaOcclusionStyle || hasMeasurementLineStyle || hasCustomTexts
      ? createVerticalAreaToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          measurementLineStyleOptions: measurementLineStyle,
          texts,
        })
      : verticalAreaToolPlugin,
    hasCustomTexts ? createLabelToolPlugin({ texts }) : labelToolPlugin,
  ];
};

export const defaultAnnotationToolPlugins =
  createDefaultAnnotationToolPlugins();
