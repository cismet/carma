import { type AnnotationInfoBoxHelpItem } from "@carma-mapping/annotations/ui";
import {
  ANNOTATION_TYPES,
  type AnnotationToolId,
  type AnnotationAreaPalette,
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
} from "@carma-mapping/annotations/core";
import {
  resolveAreaOcclusionStyleOptions,
  type AreaOcclusionStyleOptions,
  type AnnotationLineStyleOptions,
  type AnnotationToolHelpTextContext,
  ANNOTATION_DEFAULT_LABEL_THEME,
} from "@carma-mapping/annotations/runtime";
import { type DefaultAnnotationToolTexts } from "../annotation-mode-text";
import { type AreaPlanarProjectionMode } from "./area-planar-projection";

export const { AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR } = ANNOTATION_TYPES;

export const toolType = ANNOTATION_TYPE_AREA_PLANAR;

export const labelTheme = ANNOTATION_DEFAULT_LABEL_THEME;

export const isShiftInputModifier = (inputModifier: unknown) =>
  inputModifier === ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT;

export const AREA_PLANAR_OCCLUSION_STYLE_DEFAULTS =
  resolveAreaOcclusionStyleOptions({
    fill: {
      overlay: false,
    },
    line: {
      overlayDashed: true,
    },
  });

export const AREA_PLANAR_REJECTED_POINT_FEEDBACK =
  "Der letzte Punkt wurde nicht übernommen: Die projizierte Kontur würde sich selbst schneiden oder die Ebene zu stark kippen.";

export const AREA_PLANAR_REJECTED_FINISH_FEEDBACK =
  "Die Fläche kann hier noch nicht geschlossen werden: Die Abschlusskante würde die Kontur schneiden oder eine Kante doppelt verwenden. Setze einen weiteren Punkt oder lösche den letzten Punkt.";

export const AREA_PLANAR_INPUT_MODES = {
  PROJECTED_POLYGON: "projected-polygon",
  TRAPEZOID: "trapezoid",
} as const;

export type AreaPlanarInputMode =
  (typeof AREA_PLANAR_INPUT_MODES)[keyof typeof AREA_PLANAR_INPUT_MODES];

export const resolveAreaPlanarOcclusionStyleOptions = (
  occlusionStyleOptions?: AreaOcclusionStyleOptions
) => {
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions,
    AREA_PLANAR_OCCLUSION_STYLE_DEFAULTS
  );

  return {
    ...resolvedOcclusionStyleOptions,
    fill: {
      ...resolvedOcclusionStyleOptions.fill,
      overlay: false,
    },
  };
};

export type AreaPlanarToolPluginOptions = {
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  areaPalette?: AnnotationAreaPalette;
  annotationLineStyleOptions?: AnnotationLineStyleOptions;
  /** Area values turn into a pill once they do not fit inside their area; default the plain label. */
  areaLabelPills?: boolean;
  maxPlaneNormalChangeDeg?: number | null;
  trapezoidHorizontalPlaneToleranceMeters?: number | null;
  trapezoidHorizontalLineMaxLengthMeters?: number | null;
  trapezoidThirdPointRightAngleToleranceDeg?: number | null;
  trapezoidHorizontalLinePreviewDiskColorCss?: string;
  trapezoidHorizontalLinePreviewDiskOpacity?: number | null;
  texts?: DefaultAnnotationToolTexts;
};

export type AreaPlanarToolVariantConfig = {
  toolId: AnnotationToolId;
  order: number;
  label: string;
  tooltip: string;
  helpText: readonly AnnotationInfoBoxHelpItem[];
  resolveHelpText?: (
    context: AnnotationToolHelpTextContext
  ) => readonly AnnotationInfoBoxHelpItem[];
  alwaysShowHelpTextWhileActive?: boolean;
  projectionMode: AreaPlanarProjectionMode;
  inputMode?: AreaPlanarInputMode;
  iconLabel?: string;
  shortcutKey?: string;
  renderStoredPlanarAnnotations?: boolean;
  exposeInfoBox?: boolean;
};
