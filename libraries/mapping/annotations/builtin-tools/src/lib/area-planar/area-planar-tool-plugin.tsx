import {
  ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID,
  ANNOTATION_AREA_PLANAR_PCA_TOOL_ID,
  ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID,
} from "@carma-mapping/annotations/core";
import { defaultAnnotationToolTexts } from "../annotation-mode-text";
import { AREA_PLANAR_PROJECTION_MODES } from "./area-planar-projection";
import {
  toolType,
  AREA_PLANAR_INPUT_MODES,
  type AreaPlanarToolPluginOptions,
} from "./area-planar-tool-config";
import {
  AREA_PLANAR_TRAPEZOID_INITIAL_HELP_TEXT,
  createAreaPlanarTrapezoidHelpTextResolver,
} from "./area-planar-tool-help";
import { createAreaPlanarToolVariantPlugin } from "./create-area-planar-tool-variant-plugin";

export type { AreaPlanarToolPluginOptions } from "./area-planar-tool-config";

export const createAreaPlanarToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) => {
  const text =
    options.texts?.areaPlanar ?? defaultAnnotationToolTexts.areaPlanar;
  return createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: toolType,
    order: 55,
    label: text.label,
    tooltip: text.tooltip,
    shortcutKey: "C",
    helpText: text.helpText,
    projectionMode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
    renderStoredPlanarAnnotations: true,
    exposeInfoBox: true,
  });
};

export const createAreaPlanarBiggestTriangleToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) =>
  createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID,
    order: 56,
    label: "Dach 3Eck",
    tooltip: "Dachfläche aus dem größten 3-Punkt-Dreieck messen",
    iconLabel: "3Eck",
    helpText: [
      "Punkte auf der Dachfläche setzen. Die Ebene wird aus dem größten Dreieck der Eingabepunkte bestimmt.",
      "Die Messkontur wird als Hilfspolygon auf diese Ebene projiziert.",
    ],
    projectionMode: AREA_PLANAR_PROJECTION_MODES.BIGGEST_TRIANGLE,
  });

export const createAreaPlanarPcaToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) =>
  createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: ANNOTATION_AREA_PLANAR_PCA_TOOL_ID,
    order: 57,
    label: "Dach PCA",
    tooltip: "Dachfläche aus einer PCA-Ausgleichsebene messen",
    iconLabel: "PCA",
    helpText: [
      "Punkte auf der Dachfläche setzen. Die Ebene wird als PCA-Ausgleichsebene der Eingabepunkte bestimmt.",
      "Die Messkontur wird als Hilfspolygon auf diese Ebene projiziert.",
    ],
    projectionMode: AREA_PLANAR_PROJECTION_MODES.PCA,
  });

export const createAreaPlanarTrapezoidToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) =>
  createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID,
    order: 58,
    label: "Dach TR",
    tooltip: "Dachfläche mit Trapez-Konstruktion messen",
    iconLabel: "TR",
    helpText: [...AREA_PLANAR_TRAPEZOID_INITIAL_HELP_TEXT],
    resolveHelpText: createAreaPlanarTrapezoidHelpTextResolver({
      horizontalPlaneToleranceMeters:
        options.trapezoidHorizontalPlaneToleranceMeters,
      horizontalLineMaxLengthMeters:
        options.trapezoidHorizontalLineMaxLengthMeters,
      thirdPointRightAngleToleranceDeg:
        options.trapezoidThirdPointRightAngleToleranceDeg,
    }),
    alwaysShowHelpTextWhileActive: true,
    projectionMode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
    inputMode: AREA_PLANAR_INPUT_MODES.TRAPEZOID,
  });
