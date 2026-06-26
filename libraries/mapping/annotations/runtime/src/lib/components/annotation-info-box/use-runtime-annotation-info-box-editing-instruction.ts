import { createElement, useMemo } from "react";
import {
  AnnotationInfoBoxHelpContent,
  AnnotationInfoBoxTextContent,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

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
  annotationEntries,
  registry,
  authoringInstructionHelpLayout,
  helpLocale,
  includeAuthoringInstruction,
  visualOptions,
}: Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  "activeEditedNodeId" | "annotationEntries" | "registry"
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
    if (!includeAuthoringInstruction || !activeEditedNodeId) {
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
        // eslint-disable-next-line react/no-children-prop -- createElement props form, mirrors the authoring-instruction hook
        content: createElement(AnnotationInfoBoxTextContent, {
          visualOptions: resolvedVisualOptions,
          children: createElement(AnnotationInfoBoxHelpContent, {
            items: helpItems,
            layout: authoringInstructionHelpLayout,
            locale: helpLocale,
          }),
        }),
        collapsible: false,
      },
      visualOptions: resolvedVisualOptions,
    };
  }, [
    activeEditedNodeId,
    annotationEntries,
    authoringInstructionHelpLayout,
    helpLocale,
    includeAuthoringInstruction,
    registry,
    visualOptions,
  ]);
