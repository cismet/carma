import { VectorTrapezoidIcon } from "@carma-commons/ui/components";
import { type AnnotationInfoBoxHelpItem } from "@carma-mapping/annotations/ui";
import {
  ANNOTATION_TYPES,
  type AnnotationToolId,
  type AnnotationAreaPalette,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_POINT_QUERY_INPUT_MODIFIERS,
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
  inputModifier === ANNOTATION_POINT_QUERY_INPUT_MODIFIERS.SHIFT;

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

export const createAreaPlanarToolIcon = (iconLabel?: string) => (
  <span
    style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
    }}
  >
    {iconLabel ? (
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "max-content",
          fontSize: "1.34em",
          fontWeight: 700,
          lineHeight: 1,
          textAlign: "center",
          color: "#ffffff",
          WebkitTextStroke: "1px #000000",
          paintOrder: "stroke fill",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {iconLabel}
      </span>
    ) : null}
    <span
      style={{
        position: "relative",
        zIndex: 1,
        display: "inline-flex",
      }}
    >
      <VectorTrapezoidIcon fontSize="1.33em" />
    </span>
  </span>
);
