import type { ReactNode } from "react";
import type {
  AnnotationInfoBoxHelpLayout,
  AnnotationInfoBoxSlots,
  AnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import type { StoredAnnotation } from "../../store";
import type { AnnotationToolPlugin } from "../../registry";

export const RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS = {
  ANNOTATION: "annotation",
  AUTHORING_INSTRUCTION: "authoringInstruction",
} as const;

export type RuntimeAnnotationInfoBoxSlotStateKind =
  (typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS)[keyof typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS];

export type RuntimeAnnotationInfoBoxSlotsState =
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION;
      annotation: StoredAnnotation;
      instructionContent?: ReactNode;
      instructionToolId?: AnnotationToolPlugin["id"];
      slots: AnnotationInfoBoxSlots;
      visualOptions: AnnotationInfoBoxVisualOptions;
    }
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.AUTHORING_INSTRUCTION;
      plugin: AnnotationToolPlugin;
      slots: AnnotationInfoBoxSlots;
      visualOptions: AnnotationInfoBoxVisualOptions;
    };

export type RuntimeAnnotationInfoBoxVisualOptionsContext =
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION;
      annotation: StoredAnnotation;
    }
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.AUTHORING_INSTRUCTION;
      plugin: AnnotationToolPlugin;
    };

export type RuntimeAnnotationInfoBoxVisualOptionsInput =
  | Partial<AnnotationInfoBoxVisualOptions>
  | ((
      context: RuntimeAnnotationInfoBoxVisualOptionsContext
    ) => Partial<AnnotationInfoBoxVisualOptions>);

export type UseRuntimeAnnotationInfoBoxSlotsOptions = {
  authoringInstructionHelpLayout?: AnnotationInfoBoxHelpLayout;
  helpLocale?: string;
  includeAuthoringInstruction?: boolean;
  visualOptions?: RuntimeAnnotationInfoBoxVisualOptionsInput;
};
