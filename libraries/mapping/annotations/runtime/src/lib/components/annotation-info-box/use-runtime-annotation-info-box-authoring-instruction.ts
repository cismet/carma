import { createElement, useMemo, type ReactNode } from "react";
import {
  ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS,
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  AnnotationInfoBoxHelpContent,
  AnnotationInfoBoxTextContent,
  STABLE_ANNOTATION_TOOL_IDS,
  type AnnotationInfoBoxHelpItem,
  type AnnotationInfoBoxVisualOptions,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import type {
  AnnotationToolDraftState,
  AnnotationToolPlugin,
  PointQueryPickResult,
} from "../../registry";
import type { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import { resolveAnnotationToolAuthoringInstructionPlugin } from "../../utils/annotation-tool-collections";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
  type RuntimeAnnotationInfoBoxVisualOptionsInput,
  type UseRuntimeAnnotationInfoBoxSlotsOptions,
} from "./runtime-annotation-info-box-slots.types";

export type RuntimeAnnotationInfoBoxAuthoringInstruction = {
  plugin: AnnotationToolPlugin;
  content: ReactNode | null;
  visualOptions: AnnotationInfoBoxVisualOptions | null;
};

const buildAuthoringInstructionHelpItems = (
  authoringInstructionHelpText: readonly AnnotationInfoBoxHelpItem[],
  feedback: AnnotationToolDraftState["feedback"]
): readonly AnnotationInfoBoxHelpItem[] =>
  feedback
    ? [
        {
          kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
          severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING,
          text: feedback.message,
        },
        ...authoringInstructionHelpText,
      ]
    : authoringInstructionHelpText;

export const useRuntimeAnnotationInfoBoxAuthoringInstruction = ({
  activePointQueryPickResult,
  activeToolDraftFeedback,
  activeToolDraftState,
  activeToolType,
  engine,
  authoringInstructionHelpLayout,
  helpLocale,
  includeAuthoringInstruction,
  registry,
  visualOptions,
}: Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  "activeToolType" | "registry" | "engine"
> &
  Pick<
    UseRuntimeAnnotationInfoBoxSlotsOptions,
    | "authoringInstructionHelpLayout"
    | "helpLocale"
    | "includeAuthoringInstruction"
    | "visualOptions"
  > & {
    activePointQueryPickResult: PointQueryPickResult | null;
    activeToolDraftFeedback: AnnotationToolDraftState["feedback"];
    activeToolDraftState: AnnotationToolDraftState;
  }): RuntimeAnnotationInfoBoxAuthoringInstruction | null =>
  useMemo(() => {
    if (!includeAuthoringInstruction) {
      return null;
    }

    const plugin = resolveAnnotationToolAuthoringInstructionPlugin({
      activeToolType,
      registry,
    });
    if (!plugin) {
      return null;
    }

    const helpText =
      plugin.resolveHelpText?.({
        draftState: activeToolDraftState,
        pointQueryPickResult: activePointQueryPickResult,
      }) ??
      plugin.helpText ??
      [];
    const helpItems = buildAuthoringInstructionHelpItems(
      engine?.capabilities.pointQueryDiscInScene &&
        plugin.pointQuery &&
        !STABLE_ANNOTATION_TOOL_IDS.some((toolId) => toolId === plugin.id)
        ? [
            ...helpText,
            {
              kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
              text: "Der kleine offene Kreis markiert den Zielpunkt. Eine Kreuzachse liegt waagerecht in der Scheibenebene, die andere rechtwinklig dazu. Auf ebenem Boden zeigen sie Ost/West und Nord/Süd; zwei weitere Striche zeigen die Oberflächennormale. Verdeckte Teile sind gestrichelt.",
            },
            {
              kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
              text: "Die Scheibe behält ihre Weltgröße. Nach einer Kartenbewegung wird ein passender Radius gewählt; R zeigt den Radius kurz nach einer Größenänderung. Beim Einrasten und Lösen eines Snaps gleitet die Scheibe kurz zum neuen Ziel.",
            },
          ]
        : helpText,
      activeToolDraftFeedback
    );
    if (helpItems.length === 0) {
      return {
        plugin,
        content: null,
        visualOptions: null,
      };
    }

    const visualOptionsContext = {
      kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.AUTHORING_INSTRUCTION,
      plugin,
    } satisfies RuntimeAnnotationInfoBoxVisualOptionsContext;
    const resolvedVisualOptions = resolveAnnotationInfoBoxVisualOptions(
      typeof visualOptions === "function"
        ? visualOptions(visualOptionsContext)
        : visualOptions
    );

    return {
      plugin,
      content: createElement(
        AnnotationInfoBoxTextContent,
        { visualOptions: resolvedVisualOptions },
        createElement(AnnotationInfoBoxHelpContent, {
          items: helpItems,
          layout: authoringInstructionHelpLayout,
          locale: helpLocale,
          actionTriggerAlign:
            ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS.START,
        })
      ),
      visualOptions: resolvedVisualOptions,
    };
  }, [
    activePointQueryPickResult,
    activeToolDraftFeedback,
    activeToolDraftState,
    activeToolType,
    authoringInstructionHelpLayout,
    engine,
    helpLocale,
    includeAuthoringInstruction,
    registry,
    visualOptions,
  ]);
