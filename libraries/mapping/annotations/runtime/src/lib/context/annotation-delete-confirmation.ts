import type { StoredAnnotation } from "../store";

export const ANNOTATION_DELETE_CONFIRMATION_SOURCES = {
  KEYBOARD: "keyboard",
  PROGRAMMATIC: "programmatic",
  UI: "ui",
} as const;

export type AnnotationDeleteConfirmationSource =
  (typeof ANNOTATION_DELETE_CONFIRMATION_SOURCES)[keyof typeof ANNOTATION_DELETE_CONFIRMATION_SOURCES];

export type AnnotationDeleteRequestOptions = {
  skipConfirmation?: boolean;
  source?: AnnotationDeleteConfirmationSource;
};

export type AnnotationDeleteConfirmationContext = {
  annotations: readonly StoredAnnotation[];
  source: AnnotationDeleteConfirmationSource;
};

export type AnnotationDeleteConfirmationRequester = (
  context: AnnotationDeleteConfirmationContext
) => boolean | Promise<boolean>;

export const requestDefaultAnnotationDeleteConfirmation: AnnotationDeleteConfirmationRequester =
  ({ annotations }) => {
    if (annotations.length === 0) {
      return false;
    }

    if (typeof window === "undefined") {
      return true;
    }

    const message =
      annotations.length === 1
        ? "Diese Messung wirklich löschen?"
        : `${annotations.length} Messungen wirklich löschen?`;

    return window.confirm(message);
  };
