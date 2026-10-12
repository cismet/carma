import {
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpActionItem,
  type AnnotationInfoBoxHelpActionInputCombination,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";
import { type AnnotationGeographicCoordinate } from "@carma-mapping/annotations/core";
import {
  RUNTIME_AUTHORING_SAMPLE_GUIDE_COLOR_CSS,
  type AnnotationToolHelpTextContext,
} from "@carma-mapping/annotations/runtime";
import {
  canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane,
  canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength,
  doesAreaPlanarTrapezoidSampleRequireLimiterOverride,
  shouldApplyAreaPlanarTrapezoidRightAngleLimiter,
} from "./area-planar-trapezoid";
import { isShiftInputModifier } from "./area-planar-tool-config";

export const AREA_PLANAR_TRAPEZOID_HORIZONTAL_PLANE_REJECTED_POINT_FEEDBACK =
  "Der zweite Punkt wurde nicht übernommen: Auf die Schnittlinie von Hilfsscheibe und Dach klicken. Umschalttaste+Klick projiziert auf die Hilfsscheibe.";

export const AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_TOO_LONG_FEEDBACK =
  "Der letzte Punkt wurde nicht übernommen: Die horizontale Hilfslinie ist zu lang für die lokale Tangentenebene. Für längere Strecken bitte eine geodätische Linienmessung verwenden.";

export const AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_PREVIEW_DISK_COLOR_CSS =
  RUNTIME_AUTHORING_SAMPLE_GUIDE_COLOR_CSS;

export const AREA_PLANAR_TRAPEZOID_INPUT_STAGES = {
  FIRST_CORNER: "first-corner",
  SECOND_BASE_CORNER: "second-base-corner",
  THIRD_OPPOSITE_CORNER: "third-opposite-corner",
  AUTOMATIC_TRAPEZOID: "automatic-trapezoid",
} as const;

export type AreaPlanarTrapezoidInputStage =
  (typeof AREA_PLANAR_TRAPEZOID_INPUT_STAGES)[keyof typeof AREA_PLANAR_TRAPEZOID_INPUT_STAGES];

export type AreaPlanarTrapezoidStageConfig = Readonly<{
  stage: AreaPlanarTrapezoidInputStage;
  primaryInstruction: string;
  availableActions: readonly Readonly<{
    inputAlternatives: readonly AnnotationInfoBoxHelpActionInputCombination[];
    description: string;
  }>[];
}>;

export const AREA_PLANAR_TRAPEZOID_SHIFT_OVERRIDE_ACTION: AnnotationInfoBoxHelpActionItem =
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

export const AREA_PLANAR_TRAPEZOID_SHIFT_PROJECTED_SECOND_POINT_ACTION: AnnotationInfoBoxHelpActionItem =
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

export const AREA_PLANAR_TRAPEZOID_SHIFT_OVERRIDE_ACTIVE_HELP =
  "Umschalttaste+Klick deaktiviert die Limiter für den aktuellen Punkt.";

export const AREA_PLANAR_TRAPEZOID_SHIFT_PROJECTED_SECOND_POINT_ACTIVE_HELP =
  "Umschalttaste+Klick projiziert den aktuellen Punkt auf die horizontale Hilfsscheibe.";

export const AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_PLANE_REJECTED_HELP =
  "Punkt nicht übernommen: Auf die Schnittlinie von Hilfsscheibe und Dach klicken. Umschalttaste+Klick projiziert auf die Hilfsscheibe.";

export const AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_LINE_TOO_LONG_HELP =
  "Der aktuelle Punkt wird nicht übernommen: Die horizontale Hilfslinie wäre zu lang. Für längere Strecken bitte eine geodätische Linienmessung verwenden.";

export const AREA_PLANAR_TRAPEZOID_CURRENT_POINT_HORIZONTAL_PLANE_AND_LINE_REJECTED_HELP =
  "Punkt nicht übernommen: Hilfslinie zu lang und Punkt nicht auf der Hilfsscheibe. Näher an der Schnittlinie klicken oder Umschalttaste+Klick verwenden.";

export const AREA_PLANAR_TRAPEZOID_RIGHT_ANGLE_SNAPPING_HELP =
  "Der aktuelle Punkt wird auf die rechtwinklige Ecke gesetzt, weil er innerhalb des Rechtwinkel-Toleranzbereichs liegt.";

export const AREA_PLANAR_TRAPEZOID_STAGE_CONFIG_BY_STAGE = {
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

export const formatAreaPlanarTrapezoidStageHelpText = (
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

export const resolveAreaPlanarTrapezoidCurrentPointRejectionReason = ({
  coordinate,
  previousCoordinates,
  horizontalPlaneToleranceMeters,
  horizontalLineMaxLengthMeters,
}: {
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
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

export const resolveAreaPlanarTrapezoidStageConfig = (
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

export const AREA_PLANAR_TRAPEZOID_INITIAL_HELP_TEXT =
  formatAreaPlanarTrapezoidStageHelpText(
    resolveAreaPlanarTrapezoidStageConfig(0)
  );

export const createAreaPlanarTrapezoidHelpTextResolver =
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
