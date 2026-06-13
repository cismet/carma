import type { AnnotationToolPlugin } from "@carma-mapping/annotations/runtime";
import type {
  AreaOcclusionStyleOptions,
  AnnotationLineStyleOptions,
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
  annotationLineStyle?: AnnotationLineStyleOptions;
  texts?: DefaultAnnotationToolTexts;
};

export const createDefaultAnnotationToolPlugins = ({
  areaOcclusionStyle,
  areaPlanarMaxPlaneNormalChangeDeg,
  annotationLineStyle,
  texts,
}: DefaultAnnotationToolPluginsOptions = {}): readonly AnnotationToolPlugin[] => {
  const hasAnnotationLineStyle = annotationLineStyle !== undefined;
  const hasAreaPlanarNormalChangeLimit =
    areaPlanarMaxPlaneNormalChangeDeg !== undefined;
  const hasCustomTexts = texts !== undefined;

  return [
    hasCustomTexts ? createSelectToolPlugin({ texts }) : selectToolPlugin,
    hasCustomTexts ? createPointToolPlugin({ texts }) : pointToolPlugin,
    hasAnnotationLineStyle || hasCustomTexts
      ? createDistanceToolPlugin({
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : distanceToolPlugin,
    hasAnnotationLineStyle || hasCustomTexts
      ? createPolylineToolPlugin({
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : polylineToolPlugin,
    areaOcclusionStyle || hasAnnotationLineStyle || hasCustomTexts
      ? createAreaGroundToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : areaGroundToolPlugin,
    areaOcclusionStyle ||
    hasAnnotationLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : areaPlanarToolPlugin,
    areaOcclusionStyle ||
    hasAnnotationLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarBiggestTriangleToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : areaPlanarBiggestTriangleToolPlugin,
    areaOcclusionStyle ||
    hasAnnotationLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarPcaToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : areaPlanarPcaToolPlugin,
    areaOcclusionStyle ||
    hasAnnotationLineStyle ||
    hasAreaPlanarNormalChangeLimit ||
    hasCustomTexts
      ? createAreaPlanarTrapezoidToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : areaPlanarTrapezoidToolPlugin,
    areaOcclusionStyle || hasAnnotationLineStyle || hasCustomTexts
      ? createVerticalAreaToolPlugin({
          occlusionStyleOptions: areaOcclusionStyle,
          annotationLineStyleOptions: annotationLineStyle,
          texts,
        })
      : verticalAreaToolPlugin,
    hasCustomTexts ? createLabelToolPlugin({ texts }) : labelToolPlugin,
  ];
};

export const defaultAnnotationToolPlugins =
  createDefaultAnnotationToolPlugins();
