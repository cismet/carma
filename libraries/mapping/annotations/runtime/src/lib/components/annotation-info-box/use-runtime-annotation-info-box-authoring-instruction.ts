import { createElement, useMemo, type ReactNode } from "react";
import {
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  AnnotationInfoBoxHelpContent,
  AnnotationInfoBoxTextContent,
  type AnnotationInfoBoxHelpItem,
  type AnnotationInfoBoxVisualOptions,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import type {
  AnnotationToolDraftState,
  AnnotationToolPlugin,
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
  authoringInstructionHelpLayout,
  helpLocale,
  includeAuthoringInstruction,
  registry,
  visualOptions,
}: Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  "activePointQueryPickResult" | "activeToolType" | "registry"
> &
  Pick<
    UseRuntimeAnnotationInfoBoxSlotsOptions,
    | "authoringInstructionHelpLayout"
    | "helpLocale"
    | "includeAuthoringInstruction"
    | "visualOptions"
  > & {
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
      helpText,
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
      content: createElement(AnnotationInfoBoxTextContent, {
        visualOptions: resolvedVisualOptions,
        children: createElement(AnnotationInfoBoxHelpContent, {
          items: helpItems,
          layout: authoringInstructionHelpLayout,
          locale: helpLocale,
        }),
      }),
      visualOptions: resolvedVisualOptions,
    };
  }, [
    activePointQueryPickResult,
    activeToolDraftFeedback,
    activeToolDraftState,
    activeToolType,
    authoringInstructionHelpLayout,
    helpLocale,
    includeAuthoringInstruction,
    registry,
    visualOptions,
  ]);
