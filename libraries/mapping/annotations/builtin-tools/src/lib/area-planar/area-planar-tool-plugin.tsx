import { VectorTrapezoidIcon } from "@carma-commons/ui/components";
import {
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpActionItem,
  type AnnotationInfoBoxHelpActionInputCombination,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";
import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  formatMeasurementShortLabelToken,
  resolveAnnotationCommonShortcutAction,
  ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID,
  ANNOTATION_AREA_PLANAR_PCA_TOOL_ID,
  ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID,
  ANNOTATION_TYPES,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import { createPolygonAuthoringController } from "@carma-mapping/annotations/runtime";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "@carma-mapping/annotations/runtime";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_POINT_QUERY_INPUT_MODIFIERS,
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
  RUNTIME_AUTHORING_SAMPLE_GUIDE_COLOR_CSS,
  resolveAreaOcclusionStyleOptions,
  type AreaOcclusionStyleOptions,
  type MeasurementLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import type {
  AnnotationToolDraftState,
  AnnotationToolHelpTextContext,
  CesiumGeographicCoordinate,
} from "@carma-mapping/annotations/runtime";
import {
  appendAreaPreviewPoint,
  commitAreaMeasurement,
  undoAreaPreviewPoint,
} from "../area-shared/node-chain-area-tool-actions";
import { resolveAreaToolAddAnnotationOptions } from "../area-shared/resolve-area-tool-add-annotation-options";
import { createNodeChainAreaToolInfoBoxSlots } from "../area-shared/node-chain-area-tool-info-box-slots";
import {
  buildNodeChainAreaToolRenderModels,
  createNodeChainAreaToolVisuals,
} from "../area-shared/node-chain-area-tool-render-models";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "@carma-mapping/annotations/runtime";
import { formatCardinalBearing } from "@carma-mapping/annotations/runtime";
import type { DefaultAnnotationToolTexts } from "../annotation-mode-text";
import { defaultAnnotationToolTexts } from "../annotation-mode-text";
import {
  AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
  AREA_PLANAR_PROJECTION_MODES,
  canResolveAreaPlanarProjectedPolygon,
  resolveAreaPlanarProjectedCoordinates,
  type AreaPlanarProjectionMode,
} from "./area-planar-projection";
import {
  AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS,
  AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS,
  AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG,
  canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane,
  canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength,
  doesAreaPlanarTrapezoidSampleRequireLimiterOverride,
  resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters,
  resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters,
  resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg,
  resolveAreaPlanarTrapezoidMeasurementCoordinates,
  resolveNextAreaPlanarTrapezoidDraftCoordinates,
  shouldApplyAreaPlanarTrapezoidRightAngleLimiter,
} from "./area-planar-trapezoid";
const { AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_AREA_PLANAR;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;

const isShiftInputModifier = (inputModifier: unknown) =>
  inputModifier === ANNOTATION_POINT_QUERY_INPUT_MODIFIERS.SHIFT;

const AREA_PLANAR_OCCLUSION_STYLE_DEFAULTS = resolveAreaOcclusionStyleOptions({
  fill: {
    overlay: false,
  },
  line: {
    overlayDashed: true,
  },
});
const AREA_PLANAR_REJECTED_POINT_FEEDBACK =
  "Der letzte Punkt wurde nicht übernommen: Die projizierte Kontur würde sich selbst schneiden oder die Ebene zu stark kippen.";
const AREA_PLANAR_TRAPEZOID_HORIZONTAL_PLANE_REJECTED_POINT_FEEDBACK =
  "Der zweite Punkt wurde nicht übernommen: Auf die Schnittlinie von Hilfsscheibe und Dach klicken. Umschalttaste+Klick projiziert auf die Hilfsscheibe.";
const AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_TOO_LONG_FEEDBACK =
  "Der letzte Punkt wurde nicht übernommen: Die horizontale Hilfslinie ist zu lang für die lokale Tangentenebene. Für längere Strecken bitte eine geodätische Linienmessung verwenden.";
const AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_PREVIEW_DISK_COLOR_CSS =
  RUNTIME_AUTHORING_SAMPLE_GUIDE_COLOR_CSS;
const AREA_PLANAR_TRAPEZOID_INPUT_STAGES = {
  FIRST_CORNER: "first-corner",
  SECOND_BASE_CORNER: "second-base-corner",
  THIRD_OPPOSITE_CORNER: "third-opposite-corner",
  AUTOMATIC_TRAPEZOID: "automatic-trapezoid",
} as const;
type AreaPlanarTrapezoidInputStage =
  (typeof AREA_PLANAR_TRAPEZOID_INPUT_STAGES)[keyof typeof AREA_PLANAR_TRAPEZOID_INPUT_STAGES];
type AreaPlanarTrapezoidStageConfig = Readonly<{
  stage: AreaPlanarTrapezoidInputStage;
  primaryInstruction: string;
  availableActions: readonly Readonly<{
    inputAlternatives: readonly AnnotationInfoBoxHelpActionInputCombination[];
    description: string;
  }>[];
}>;
const AREA_PLANAR_TRAPEZOID_SHIFT_OVERRIDE_ACTION: AnnotationInfoBoxHelpActionItem =
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    inputAlternatives: [
      [
        ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT,
        ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK,
      ],
    ],
    description:
      "Umschalttaste+Klick deaktiviert die Limiter und erlaubt den aktuellen Punkt.",
  };
const AREA_PLANAR_TRAPEZOID_SHIFT_PROJECTED_SECOND_POINT_ACTION: AnnotationInfoBoxHelpActionItem =
  {
    kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
    inputAlternatives: [
      [
        ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT,
        ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK,
      ],
    ],
    description:
      "Umschalttaste+Klick setzt den auf die Hilfsscheibe projizierten Punkt.",
  };
const AREA_PLANAR_TRAPEZOID_SHIFT_OVERRIDE_ACTIVE_HELP =
  "Umschalttaste+Klick deaktiviert die Limiter für den aktuellen Punkt.";
const AREA_PLANAR_TRAPEZOID_SHIFT_PROJECTED_SECOND_POINT_ACTIVE_HELP =
  "Umschalttaste+Klick projiziert den aktuellen Punkt auf die horizontale Hilfsscheibe.";
const AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_PLANE_REJECTED_HELP =
  "Punkt nicht übernommen: Auf die Schnittlinie von Hilfsscheibe und Dach klicken. Umschalttaste+Klick projiziert auf die Hilfsscheibe.";
const AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_LINE_TOO_LONG_HELP =
  "Der aktuelle Punkt wird nicht übernommen: Die horizontale Hilfslinie wäre zu lang. Für längere Strecken bitte eine geodätische Linienmessung verwenden.";
const AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_PLANE_AND_LINE_REJECTED_HELP =
  "Punkt nicht übernommen: Hilfslinie zu lang und Punkt nicht auf der Hilfsscheibe. Näher an der Schnittlinie klicken oder Umschalttaste+Klick verwenden.";
const AREA_PLANAR_TRAPEZOID_RIGHT_ANGLE_SNAPPING_HELP =
  "Der aktuelle Punkt wird auf die rechtwinklige Ecke gesetzt, weil er innerhalb des Rechtwinkel-Toleranzbereichs liegt.";
const AREA_PLANAR_TRAPEZOID_STAGE_CONFIG_BY_STAGE = {
  [AREA_PLANAR_TRAPEZOID_INPUT_STAGES.FIRST_CORNER]: {
    stage: AREA_PLANAR_TRAPEZOID_INPUT_STAGES.FIRST_CORNER,
    primaryInstruction: "Eine Dachecke an horizontaler Dachkante anklicken.",
    availableActions: [
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt den ersten Punkt.",
      },
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ],
  },
  [AREA_PLANAR_TRAPEZOID_INPUT_STAGES.SECOND_BASE_CORNER]: {
    stage: AREA_PLANAR_TRAPEZOID_INPUT_STAGES.SECOND_BASE_CORNER,
    primaryInstruction:
      "Zweiten Punkt auf derselben horizontalen Dachkante anklicken.",
    availableActions: [
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt die Basiskante auf der horizontalen Hilfsscheibe.",
      },
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ],
  },
  [AREA_PLANAR_TRAPEZOID_INPUT_STAGES.THIRD_OPPOSITE_CORNER]: {
    stage: AREA_PLANAR_TRAPEZOID_INPUT_STAGES.THIRD_OPPOSITE_CORNER,
    primaryInstruction:
      "Dritten Punkt auf der parallelen Gegenkante anklicken.",
    availableActions: [
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt den dritten Punkt.",
      },
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ],
  },
  [AREA_PLANAR_TRAPEZOID_INPUT_STAGES.AUTOMATIC_TRAPEZOID]: {
    stage: AREA_PLANAR_TRAPEZOID_INPUT_STAGES.AUTOMATIC_TRAPEZOID,
    primaryInstruction:
      "Das automatische Trapez ist bereit. Optional die asymmetrische vierte Ecke auf der Gegenkante anklicken, wenn die Form nicht passt.",
    availableActions: [
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description:
          "Setzt optional die asymmetrische vierte Ecke und schliesst die Messung.",
      },
      {
        inputAlternatives: [
          [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DOUBLE_CLICK],
          [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ENTER],
        ],
        description: "Schliesst die Trapezfläche mit symmetrischer Form.",
      },
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ],
  },
} as const satisfies Record<
  AreaPlanarTrapezoidInputStage,
  AreaPlanarTrapezoidStageConfig
>;

const formatAreaPlanarTrapezoidStageHelpText = (
  stageConfig: AreaPlanarTrapezoidStageConfig,
  {
    clickDisabledReason = null,
    rightAngleLimiterActive = false,
    showLimiterOverrideAction = false,
  }: {
    clickDisabledReason?: string | null;
    rightAngleLimiterActive?: boolean;
    showLimiterOverrideAction?: boolean;
  } = {}
): readonly AnnotationInfoBoxHelpItem[] => {
  const availableActions = clickDisabledReason
    ? stageConfig.availableActions.filter(
        ({ inputAlternatives }) =>
          !inputAlternatives.some((inputCombination) =>
            inputCombination.includes(
              ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK
            )
          )
      )
    : stageConfig.availableActions;
  const isSecondBaseCorner =
    stageConfig.stage === AREA_PLANAR_TRAPEZOID_INPUT_STAGES.SECOND_BASE_CORNER;
  const limiterOverrideAction =
    clickDisabledReason || isSecondBaseCorner
      ? AREA_PLANAR_TRAPEZOID_SHIFT_PROJECTED_SECOND_POINT_ACTION
      : AREA_PLANAR_TRAPEZOID_SHIFT_OVERRIDE_ACTION;
  const limiterOverrideActions = showLimiterOverrideAction
    ? [limiterOverrideAction]
    : [];
  const activeHelpItems: AnnotationInfoBoxHelpItem[] = [];

  if (clickDisabledReason) {
    activeHelpItems.push({
      kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
      severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING,
      text: clickDisabledReason,
      actions: limiterOverrideActions,
    });
  } else if (rightAngleLimiterActive) {
    activeHelpItems.push({
      kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
      severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO,
      text: AREA_PLANAR_TRAPEZOID_RIGHT_ANGLE_SNAPPING_HELP,
      actions: limiterOverrideActions,
    });
  } else if (showLimiterOverrideAction) {
    activeHelpItems.push({
      kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
      severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO,
      text: isSecondBaseCorner
        ? AREA_PLANAR_TRAPEZOID_SHIFT_PROJECTED_SECOND_POINT_ACTIVE_HELP
        : AREA_PLANAR_TRAPEZOID_SHIFT_OVERRIDE_ACTIVE_HELP,
      actions: limiterOverrideActions,
    });
  }

  return [
    ...activeHelpItems,
    {
      kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
      text: stageConfig.primaryInstruction,
    },
    ...availableActions.map(({ inputAlternatives, description }) => {
      const isClickAction = inputAlternatives.some((inputCombination) =>
        inputCombination.includes(ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK)
      );
      const resolvedDescription =
        rightAngleLimiterActive &&
        stageConfig.stage ===
          AREA_PLANAR_TRAPEZOID_INPUT_STAGES.THIRD_OPPOSITE_CORNER &&
        isClickAction
          ? "Setzt den dritten Punkt mit Rechtwinkel-Limiter."
          : description;

      return {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives,
        description: resolvedDescription,
      };
    }),
  ];
};

const resolveAreaPlanarTrapezoidCurrentPointRejectionReason = ({
  coordinate,
  previousCoordinates,
  horizontalPlaneToleranceMeters,
  horizontalLineMaxLengthMeters,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
  horizontalPlaneToleranceMeters?: number | null;
  horizontalLineMaxLengthMeters?: number | null;
}): string | null => {
  if (previousCoordinates.length !== 1) {
    return null;
  }

  const isOffHorizontalPlane =
    !canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
      coordinate,
      previousCoordinates,
      toleranceMeters: horizontalPlaneToleranceMeters,
    });
  const isTooLong =
    !canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
      coordinate,
      previousCoordinates,
      maxLengthMeters: horizontalLineMaxLengthMeters,
    });

  if (isOffHorizontalPlane && isTooLong) {
    return AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_PLANE_AND_LINE_REJECTED_HELP;
  }

  if (isOffHorizontalPlane) {
    return AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_PLANE_REJECTED_HELP;
  }

  if (isTooLong) {
    return AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_LINE_TOO_LONG_HELP;
  }

  return null;
};

const resolveAreaPlanarTrapezoidStageConfig = (
  draftCoordinateCount: number
): AreaPlanarTrapezoidStageConfig => {
  if (draftCoordinateCount <= 0) {
    return AREA_PLANAR_TRAPEZOID_STAGE_CONFIG_BY_STAGE[
      AREA_PLANAR_TRAPEZOID_INPUT_STAGES.FIRST_CORNER
    ];
  }

  if (draftCoordinateCount === 1) {
    return AREA_PLANAR_TRAPEZOID_STAGE_CONFIG_BY_STAGE[
      AREA_PLANAR_TRAPEZOID_INPUT_STAGES.SECOND_BASE_CORNER
    ];
  }

  if (draftCoordinateCount === 2) {
    return AREA_PLANAR_TRAPEZOID_STAGE_CONFIG_BY_STAGE[
      AREA_PLANAR_TRAPEZOID_INPUT_STAGES.THIRD_OPPOSITE_CORNER
    ];
  }

  return AREA_PLANAR_TRAPEZOID_STAGE_CONFIG_BY_STAGE[
    AREA_PLANAR_TRAPEZOID_INPUT_STAGES.AUTOMATIC_TRAPEZOID
  ];
};

const AREA_PLANAR_TRAPEZOID_INITIAL_HELP_TEXT =
  formatAreaPlanarTrapezoidStageHelpText(
    resolveAreaPlanarTrapezoidStageConfig(0)
  );
const AREA_PLANAR_INPUT_MODES = {
  PROJECTED_POLYGON: "projected-polygon",
  TRAPEZOID: "trapezoid",
} as const;

type AreaPlanarInputMode =
  (typeof AREA_PLANAR_INPUT_MODES)[keyof typeof AREA_PLANAR_INPUT_MODES];

const resolveAreaPlanarOcclusionStyleOptions = (
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
  measurementLineStyleOptions?: MeasurementLineStyleOptions;
  maxPlaneNormalChangeDeg?: number | null;
  trapezoidHorizontalPlaneToleranceMeters?: number | null;
  trapezoidHorizontalLineMaxLengthMeters?: number | null;
  trapezoidThirdPointRightAngleToleranceDeg?: number | null;
  trapezoidHorizontalLinePreviewDiskColorCss?: string;
  trapezoidHorizontalLinePreviewDiskOpacity?: number | null;
  texts?: DefaultAnnotationToolTexts;
};

type AreaPlanarToolVariantConfig = {
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

const createAreaPlanarToolIcon = (iconLabel?: string) => (
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

const createAreaPlanarTrapezoidHelpTextResolver =
  ({
    horizontalPlaneToleranceMeters,
    horizontalLineMaxLengthMeters,
    thirdPointRightAngleToleranceDeg,
  }: {
    horizontalPlaneToleranceMeters: number | null | undefined;
    horizontalLineMaxLengthMeters: number | null | undefined;
    thirdPointRightAngleToleranceDeg: number | null | undefined;
  }) =>
  ({
    draftState,
    pointQueryPickResult,
  }: AnnotationToolHelpTextContext): readonly AnnotationInfoBoxHelpItem[] => {
    const coordinate = pointQueryPickResult?.coordinate ?? null;
    const limitersSuspended = isShiftInputModifier(
      pointQueryPickResult?.inputModifier
    );
    const clickDisabledReason =
      coordinate !== null && !limitersSuspended
        ? resolveAreaPlanarTrapezoidCurrentPointRejectionReason({
            coordinate,
            previousCoordinates: draftState.coordinates,
            horizontalPlaneToleranceMeters,
            horizontalLineMaxLengthMeters,
          })
        : null;
    const sampleRequiresLimiterOverride =
      coordinate !== null &&
      !limitersSuspended &&
      doesAreaPlanarTrapezoidSampleRequireLimiterOverride({
        coordinate,
        previousCoordinates: draftState.coordinates,
        horizontalPlaneToleranceMeters,
        horizontalLineMaxLengthMeters,
        thirdPointRightAngleToleranceDeg,
      });
    const rightAngleLimiterActive =
      sampleRequiresLimiterOverride &&
      shouldApplyAreaPlanarTrapezoidRightAngleLimiter(
        draftState.coordinates.length
      );
    const showLimiterOverrideAction =
      limitersSuspended ||
      clickDisabledReason !== null ||
      sampleRequiresLimiterOverride;

    return formatAreaPlanarTrapezoidStageHelpText(
      resolveAreaPlanarTrapezoidStageConfig(draftState.coordinates.length),
      {
        clickDisabledReason,
        rightAngleLimiterActive,
        showLimiterOverrideAction,
      }
    );
  };

const createAreaPlanarToolVariantPlugin = ({
  toolId,
  order,
  label,
  tooltip,
  shortcutKey,
  helpText,
  resolveHelpText,
  alwaysShowHelpTextWhileActive,
  projectionMode,
  inputMode = AREA_PLANAR_INPUT_MODES.PROJECTED_POLYGON,
  iconLabel,
  renderStoredPlanarAnnotations = false,
  exposeInfoBox = false,
  occlusionStyleOptions,
  measurementLineStyleOptions,
  maxPlaneNormalChangeDeg = AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
  trapezoidHorizontalPlaneToleranceMeters = AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS,
  trapezoidHorizontalLineMaxLengthMeters = AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS,
  trapezoidThirdPointRightAngleToleranceDeg = AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG,
  trapezoidHorizontalLinePreviewDiskColorCss = AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_PREVIEW_DISK_COLOR_CSS,
  trapezoidHorizontalLinePreviewDiskOpacity = 0.45,
  texts = defaultAnnotationToolTexts,
}: AreaPlanarToolPluginOptions & AreaPlanarToolVariantConfig) => {
  const text = texts.areaPlanar;
  const isTrapezoidInputMode = inputMode === AREA_PLANAR_INPUT_MODES.TRAPEZOID;
  const resolvedTrapezoidHorizontalPlaneToleranceMeters =
    resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters(
      trapezoidHorizontalPlaneToleranceMeters
    );
  const resolvedTrapezoidHorizontalLineMaxLengthMeters =
    resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters(
      trapezoidHorizontalLineMaxLengthMeters
    );
  const resolvedTrapezoidThirdPointRightAngleToleranceDeg =
    resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg(
      trapezoidThirdPointRightAngleToleranceDeg
    );
  const resolveMeasurementInputCoordinates = (
    coordinates: readonly CesiumGeographicCoordinate[]
  ) =>
    isTrapezoidInputMode
      ? resolveAreaPlanarTrapezoidMeasurementCoordinates(coordinates)
      : coordinates;
  const getAreaPlanarToolInfoBoxSlots = createNodeChainAreaToolInfoBoxSlots(
    toolType,
    {
      headingTitle: text.headingTitle,
      headingColor: labelTheme.scheme.colorPrimary,
      formatMeasurementLabelToken: (counter) =>
        formatMeasurementShortLabelToken(toolType, counter),
      actionLabels: texts.actions,
      navigationLabels: texts.navigation,
      metricLabels: text.metricLabels,
      formatBearing: (bearingRad) => formatCardinalBearing(bearingRad),
    }
  );
  const resolvedOcclusionStyleOptions = resolveAreaPlanarOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const areaPlanarToolVisuals = createNodeChainAreaToolVisuals({
    fillType: toolType,
    measurementLineStyleOptions,
  });

  return createMeasurementToolPlugin({
    id: toolId,
    annotationType: toolType,
    descriptor: {
      id: toolId,
      order,
      label,
      tooltip,
      shortcutKey,
      icon: createAreaPlanarToolIcon(iconLabel),
    },
    helpText,
    resolveHelpText,
    alwaysShowHelpTextWhileActive,
    capabilities: [
      ...AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
      ANNOTATION_TOOL_PLUGIN_CAPABILITIES.ADD_ANNOTATION,
      ...(exposeInfoBox ? [ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX] : []),
    ],
    session: {
      createSession: ({ drafts, setActiveToolType, addAnnotation }) => {
        const requestFinish = () => {
          const draft = drafts.get(toolId);
          if (isTrapezoidInputMode && draft.coordinates.length < 3) {
            return false;
          }

          const measurementInputCoordinates =
            resolveMeasurementInputCoordinates(draft.coordinates);
          const projectedCoordinates = resolveAreaPlanarProjectedCoordinates({
            coordinates: measurementInputCoordinates,
            mode: projectionMode,
          });
          const nextMeasurement = commitAreaMeasurement({
            toolType,
            coordinates: projectedCoordinates ?? [],
            addAnnotation,
            sourceToolId: toolId,
          });

          if (!nextMeasurement) {
            return false;
          }

          drafts.clear(toolId);
          return true;
        };

        return {
          toolType: toolId,
          requestStart: () => {
            setActiveToolType(toolId);
          },
          requestFinish,
          discardDraft: () => {
            drafts.clear(toolId);
          },
          onNodeCreated: (coordinate, linkedNodeGroupId, options) => {
            const currentDraft = drafts.get(toolId);
            const limitersSuspended =
              isTrapezoidInputMode &&
              isShiftInputModifier(options?.inputModifier);
            const isFourthTrapezoidPoint =
              isTrapezoidInputMode && currentDraft.coordinates.length === 3;
            const horizontalLineMaxLengthMeters = limitersSuspended
              ? Number.POSITIVE_INFINITY
              : resolvedTrapezoidHorizontalLineMaxLengthMeters;
            const horizontalPlaneToleranceMeters = limitersSuspended
              ? Number.POSITIVE_INFINITY
              : resolvedTrapezoidHorizontalPlaneToleranceMeters;
            if (
              isTrapezoidInputMode &&
              !canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength(
                {
                  coordinate,
                  previousCoordinates: currentDraft.coordinates,
                  maxLengthMeters: horizontalLineMaxLengthMeters,
                }
              )
            ) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message:
                    AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_TOO_LONG_FEEDBACK,
                },
              });
              return;
            }
            if (
              isTrapezoidInputMode &&
              !canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
                coordinate,
                previousCoordinates: currentDraft.coordinates,
                toleranceMeters: horizontalPlaneToleranceMeters,
              })
            ) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message:
                    AREA_PLANAR_TRAPEZOID_HORIZONTAL_PLANE_REJECTED_POINT_FEEDBACK,
                },
              });
              return;
            }
            const nextCoordinates = isTrapezoidInputMode
              ? resolveNextAreaPlanarTrapezoidDraftCoordinates({
                  coordinate,
                  previousCoordinates: currentDraft.coordinates,
                  thirdPointRightAngleToleranceDeg:
                    resolvedTrapezoidThirdPointRightAngleToleranceDeg,
                  limitersSuspended,
                })
              : appendAreaPreviewPoint(currentDraft.coordinates, coordinate);
            if (!nextCoordinates) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message: AREA_PLANAR_REJECTED_POINT_FEEDBACK,
                },
              });
              return;
            }
            const nextMeasurementInputCoordinates =
              resolveMeasurementInputCoordinates(nextCoordinates);
            const previousMeasurementInputCoordinates =
              resolveMeasurementInputCoordinates(currentDraft.coordinates);
            if (
              !canResolveAreaPlanarProjectedPolygon({
                coordinates: nextMeasurementInputCoordinates,
                mode: projectionMode,
                previousCoordinates: previousMeasurementInputCoordinates,
                maxPlaneNormalChangeDeg,
              })
            ) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message: AREA_PLANAR_REJECTED_POINT_FEEDBACK,
                },
              });
              return;
            }

            const nextDraft: AnnotationToolDraftState = {
              coordinates: nextCoordinates,
              linkedNodeGroupIds: appendAreaPreviewPoint(
                currentDraft.linkedNodeGroupIds,
                linkedNodeGroupId ?? null
              ),
              feedback: null,
            };
            drafts.set(toolId, nextDraft);
            if (isFourthTrapezoidPoint) {
              requestFinish();
            }
          },
          finishesOnLoopClosure: true,
        };
      },
    },
    pointQuery: {
      ...(isTrapezoidInputMode
        ? {
            inputModifiers: [ANNOTATION_POINT_QUERY_INPUT_MODIFIERS.SHIFT],
          }
        : {}),
      onPointCreated: ({
        coordinate,
        linkedNodeGroupId,
        activeToolSession,
        inputModifier,
      }) => {
        activeToolSession?.onNodeCreated?.(coordinate, linkedNodeGroupId, {
          inputModifier,
        });
      },
    },
    addAnnotation: {
      resolveOptions: resolveAreaToolAddAnnotationOptions,
    },
    authoringVisuals: {
      createController: (context) =>
        createPolygonAuthoringController({
          toolType,
          draftToolId: toolId,
          context,
          occlusionStyleOptions: resolvedOcclusionStyleOptions,
          measurementLineStyleOptions,
          showInitialHorizontalLinePreview: isTrapezoidInputMode,
          initialHorizontalLinePreviewDiskColorCss:
            trapezoidHorizontalLinePreviewDiskColorCss,
          initialHorizontalLinePreviewDiskOpacity:
            trapezoidHorizontalLinePreviewDiskOpacity,
          initialHorizontalLinePreviewPlaneToleranceMeters:
            resolvedTrapezoidHorizontalPlaneToleranceMeters,
          initialHorizontalLinePreviewMaxLengthMeters:
            resolvedTrapezoidHorizontalLineMaxLengthMeters,
          resolvePointQueryVisualStyle: ({
            pickResult,
            previousCoordinates,
            currentPointQueryPickAcceptable,
          }) => {
            const coordinate = pickResult?.coordinate ?? null;
            const limitersSuspended =
              isTrapezoidInputMode &&
              isShiftInputModifier(pickResult?.inputModifier);
            if (
              !isTrapezoidInputMode ||
              limitersSuspended ||
              !coordinate ||
              !currentPointQueryPickAcceptable
            ) {
              return undefined;
            }

            const sampleRequiresLimiterOverride =
              doesAreaPlanarTrapezoidSampleRequireLimiterOverride({
                coordinate,
                previousCoordinates,
                horizontalPlaneToleranceMeters:
                  resolvedTrapezoidHorizontalPlaneToleranceMeters,
                horizontalLineMaxLengthMeters:
                  resolvedTrapezoidHorizontalLineMaxLengthMeters,
                thirdPointRightAngleToleranceDeg:
                  resolvedTrapezoidThirdPointRightAngleToleranceDeg,
              });
            const rightAngleLimiterActive =
              sampleRequiresLimiterOverride &&
              shouldApplyAreaPlanarTrapezoidRightAngleLimiter(
                previousCoordinates.length
              );

            return rightAngleLimiterActive
              ? { color: RUNTIME_AUTHORING_SAMPLE_GUIDE_COLOR_CSS }
              : undefined;
          },
          resolveMeasurementCoordinates: ({
            coordinates,
            previousCoordinates,
            preferredFacingPositionECEF,
            inputModifier,
          }) => {
            const limitersSuspended =
              isTrapezoidInputMode && isShiftInputModifier(inputModifier);
            if (
              isTrapezoidInputMode &&
              !limitersSuspended &&
              coordinates.length === 2 &&
              previousCoordinates?.length === 1 &&
              !canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength(
                {
                  coordinate: coordinates[1]!,
                  previousCoordinates,
                  maxLengthMeters:
                    resolvedTrapezoidHorizontalLineMaxLengthMeters,
                }
              )
            ) {
              return null;
            }
            if (
              isTrapezoidInputMode &&
              !limitersSuspended &&
              coordinates.length === 2 &&
              previousCoordinates?.length === 1 &&
              !canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
                coordinate: coordinates[1]!,
                previousCoordinates,
                toleranceMeters:
                  resolvedTrapezoidHorizontalPlaneToleranceMeters,
              })
            ) {
              return null;
            }
            const nextTrapezoidCandidateCoordinates =
              isTrapezoidInputMode &&
              previousCoordinates &&
              coordinates.length === previousCoordinates.length + 1
                ? resolveNextAreaPlanarTrapezoidDraftCoordinates({
                    coordinate: coordinates[coordinates.length - 1]!,
                    previousCoordinates,
                    thirdPointRightAngleToleranceDeg:
                      resolvedTrapezoidThirdPointRightAngleToleranceDeg,
                    limitersSuspended,
                  })
                : coordinates;
            if (!nextTrapezoidCandidateCoordinates) {
              return null;
            }
            const measurementInputCoordinates =
              resolveMeasurementInputCoordinates(
                nextTrapezoidCandidateCoordinates
              );
            const previousMeasurementInputCoordinates = previousCoordinates
              ? resolveMeasurementInputCoordinates(previousCoordinates)
              : previousCoordinates;
            if (measurementInputCoordinates.length < 3) {
              return measurementInputCoordinates;
            }

            return canResolveAreaPlanarProjectedPolygon({
              coordinates: measurementInputCoordinates,
              mode: projectionMode,
              previousCoordinates: previousMeasurementInputCoordinates,
              preferredFacingPositionECEF,
              maxPlaneNormalChangeDeg,
            })
              ? resolveAreaPlanarProjectedCoordinates({
                  coordinates: measurementInputCoordinates,
                  mode: projectionMode,
                  preferredFacingPositionECEF,
                })
              : null;
          },
        }),
    },
    keyboard: {
      onKeyDown: ({ event, activeToolSession, sessionContext }) => {
        const shortcutAction = resolveAnnotationCommonShortcutAction(event);
        if (
          shortcutAction ===
          ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL
        ) {
          activeToolSession?.discardDraft();
          event.preventDefault();
          return true;
        }

        if (
          shortcutAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT
        ) {
          const currentDraft = sessionContext.drafts.get(toolId);
          if (currentDraft.coordinates.length === 0) {
            return false;
          }

          sessionContext.drafts.set(toolId, {
            coordinates: undoAreaPreviewPoint(currentDraft.coordinates),
            linkedNodeGroupIds: undoAreaPreviewPoint(
              currentDraft.linkedNodeGroupIds
            ),
            feedback: null,
          });
          event.preventDefault();
          return true;
        }

        return false;
      },
    },
    visualModels: {
      build: ({
        nodes,
        annotationEntries,
        selectedAnnotationIds,
        setSelectedAnnotationId,
        formatOptions,
        onNodeLongPress,
      }) => {
        if (!renderStoredPlanarAnnotations) {
          return null;
        }

        return buildNodeChainAreaToolRenderModels({
          toolType,
          visuals: areaPlanarToolVisuals,
          nodes,
          measurements: annotationEntries,
          selectedMeasurementIds: selectedAnnotationIds,
          fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
          formatOptions,
          onMeasurementSelect: setSelectedAnnotationId,
          onNodeLongPress,
          occlusionStyleOptions: resolvedOcclusionStyleOptions,
        });
      },
    },
    ...(exposeInfoBox
      ? {
          infoBox: {
            getSlots: getAreaPlanarToolInfoBoxSlots,
          },
        }
      : {}),
  });
};

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

export const areaPlanarToolPlugin = createAreaPlanarToolPlugin();
export const areaPlanarBiggestTriangleToolPlugin =
  createAreaPlanarBiggestTriangleToolPlugin();
export const areaPlanarPcaToolPlugin = createAreaPlanarPcaToolPlugin();
export const areaPlanarTrapezoidToolPlugin =
  createAreaPlanarTrapezoidToolPlugin();
