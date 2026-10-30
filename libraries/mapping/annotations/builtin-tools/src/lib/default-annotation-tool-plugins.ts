import type {
  AnnotationToolPlugin,
  AreaOcclusionStyleOptions,
  AnnotationLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import {
  BASIC_ANNOTATION_NODE_EDIT_RULES,
  resolveAnnotationNodeEditRule,
} from "@carma-mapping/annotations/runtime";
import { createAreaGroundToolPlugin } from "./area-ground/area-ground-tool-plugin";
import {
  createAreaPlanarBiggestTriangleToolPlugin,
  createAreaPlanarPcaToolPlugin,
  createAreaPlanarToolPlugin,
  createAreaPlanarTrapezoidToolPlugin,
} from "./area-planar/area-planar-tool-plugin";
import { createDistanceToolPlugin } from "./distance/distance-tool-plugin";
import { createLabelToolPlugin } from "./label/label-tool-plugin";
import { createPointToolPlugin } from "./point/point-tool-plugin";
import { createPolylineToolPlugin } from "./polyline/polyline-tool-plugin";
import { createSelectToolPlugin } from "./select/select-tool-plugin";
import { createVerticalAreaToolPlugin } from "./vertical-area/vertical-area-tool-plugin";
import type { DefaultAnnotationToolTexts } from "./annotation-mode-text";
import {
  createAnnotationAreaPalette,
  type AnnotationAreaPaletteOptions,
  type AnnotationType,
} from "@carma-mapping/annotations/core";

/**
 * Refinements of the tools that the MapLibre measurement enables. Every one
 * defaults to off, which keeps the behaviour of the Cesium measurement.
 */
export type AnnotationToolBehaviorOptions = {
  /**
   * Per-type node edit rules: footprint corners stay horizontal, roof and
   * wall corners stay in their plane, height arrows only where they move
   * something. Off: every node keeps the height arrows and only a roof
   * corner is held to its plane.
   */
  nodeEditRules?: boolean;
  /** Area values turn into a pill once they do not fit inside their area. Off: the plain area label. */
  areaLabelPills?: boolean;
  /** The polyline total as one badge at the screen-left end of the chain. Off: the label at the last node. */
  polylineEndBadge?: boolean;
};

export type DefaultAnnotationToolPluginsOptions =
  AnnotationToolBehaviorOptions & {
    areaOcclusionStyle?: AreaOcclusionStyleOptions;
    /** Other colours or alphas for the area fills; combines with the rest. */
    areaStyle?: AnnotationAreaPaletteOptions;
    areaPlanarMaxPlaneNormalChangeDeg?: number | null;
    annotationLineStyle?: AnnotationLineStyleOptions;
    texts?: DefaultAnnotationToolTexts;
  };

/** The tool declares how the nodes of its measurements are edited. */
const withNodeEditRule = (
  plugin: AnnotationToolPlugin,
  nodeEditRules: boolean
): AnnotationToolPlugin => {
  const annotationType = plugin.annotationType as AnnotationType | null;
  const nodeEdit = !annotationType
    ? undefined
    : nodeEditRules
    ? resolveAnnotationNodeEditRule(annotationType)
    : BASIC_ANNOTATION_NODE_EDIT_RULES[annotationType];
  return nodeEdit ? { ...plugin, nodeEdit } : plugin;
};

export const createDefaultAnnotationToolPlugins = ({
  areaOcclusionStyle,
  areaStyle,
  areaPlanarMaxPlaneNormalChangeDeg,
  annotationLineStyle,
  texts,
  nodeEditRules = false,
  areaLabelPills = false,
  polylineEndBadge = false,
}: DefaultAnnotationToolPluginsOptions = {}): readonly AnnotationToolPlugin[] => {
  const lineOptions = {
    annotationLineStyleOptions: annotationLineStyle,
    texts,
  };
  const areaOptions = {
    occlusionStyleOptions: areaOcclusionStyle,
    areaPalette: areaStyle ? createAnnotationAreaPalette(areaStyle) : undefined,
    annotationLineStyleOptions: annotationLineStyle,
    areaLabelPills,
    texts,
  };
  const areaPlanarOptions = {
    ...areaOptions,
    maxPlaneNormalChangeDeg: areaPlanarMaxPlaneNormalChangeDeg,
  };

  return [
    createSelectToolPlugin({ texts }),
    createPointToolPlugin({ texts }),
    createDistanceToolPlugin(lineOptions),
    createPolylineToolPlugin({ ...lineOptions, endBadge: polylineEndBadge }),
    createAreaGroundToolPlugin(areaOptions),
    createAreaPlanarToolPlugin(areaPlanarOptions),
    createAreaPlanarBiggestTriangleToolPlugin(areaPlanarOptions),
    createAreaPlanarPcaToolPlugin(areaPlanarOptions),
    createAreaPlanarTrapezoidToolPlugin(areaPlanarOptions),
    createVerticalAreaToolPlugin(areaOptions),
    createLabelToolPlugin({ texts }),
  ].map((plugin) => withNodeEditRule(plugin, nodeEditRules));
};

export const defaultAnnotationToolPlugins =
  createDefaultAnnotationToolPlugins();
