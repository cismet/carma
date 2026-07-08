import { createElement, useMemo } from "react";
import {
  ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS,
  AnnotationInfoBoxHelpContent,
  AnnotationInfoBoxTextContent,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";
import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";

import type { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import { resolveNodeEditHelpItems } from "./node-edit-help";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxSlotsState,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
  type UseRuntimeAnnotationInfoBoxSlotsOptions,
} from "./runtime-annotation-info-box-slots.types";

// Top-priority info-box slot shown while a measurement node is being edited.
// The help is resolved purely from the edited measurement's geometry type and
// node count — independent of the active tool (works from Select or any tool).
export const useRuntimeAnnotationInfoBoxEditingInstruction = ({
  activeEditedNodeId,
  activeToolType,
  annotationEntries,
  registry,
  authoringInstructionHelpLayout,
  helpLocale,
  includeAuthoringInstruction,
  visualOptions,
}: Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  "activeEditedNodeId" | "activeToolType" | "annotationEntries" | "registry"
> &
  Pick<
    UseRuntimeAnnotationInfoBoxSlotsOptions,
    | "authoringInstructionHelpLayout"
    | "helpLocale"
    | "includeAuthoringInstruction"
    | "visualOptions"
  >): Extract<
  RuntimeAnnotationInfoBoxSlotsState,
  { kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.AUTHORING_INSTRUCTION }
> | null =>
  useMemo(() => {
    // The editing tutorial is only shown while the Select tool is active, so it
    // does not appear when a measurement is selected under another tool
    // (cismet/wupp#4078).
    if (
      !includeAuthoringInstruction ||
      !activeEditedNodeId ||
      activeToolType !== ANNOTATION_SELECT_TOOL_ID
    ) {
      return null;
    }

    const editedAnnotation =
      annotationEntries.find((annotationEntry) =>
        annotationEntry.nodeIds.includes(activeEditedNodeId)
      ) ?? null;
    if (!editedAnnotation) {
      return null;
    }

    const plugin =
      registry.getPlugin(editedAnnotation.toolType) ??
      registry.getPluginsByAnnotationType(editedAnnotation.toolType)[0] ??
      null;
    if (!plugin) {
      return null;
    }

    const helpItems = resolveNodeEditHelpItems({
      toolType: editedAnnotation.toolType,
    });
    if (helpItems.length === 0) {
      return null;
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
      kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.AUTHORING_INSTRUCTION,
      plugin,
      slots: {
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
        collapsible: false,
      },
      visualOptions: resolvedVisualOptions,
    };
  }, [
    activeEditedNodeId,
    activeToolType,
    annotationEntries,
    authoringInstructionHelpLayout,
    helpLocale,
    includeAuthoringInstruction,
    registry,
    visualOptions,
  ]);
