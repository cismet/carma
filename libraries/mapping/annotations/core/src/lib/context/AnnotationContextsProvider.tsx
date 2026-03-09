import type { ReactNode } from "react";
import {
  AnnotationEditContext,
  type AnnotationEditContextType,
} from "./AnnotationEditContext";
import {
  AnnotationModeOptionsContext,
  type AnnotationModeOptionsContextType,
} from "./AnnotationModeOptionsContext";
import {
  AnnotationSelectionContext,
  type AnnotationSelectionContextType,
} from "./AnnotationSelectionContext";
import {
  AnnotationVisibilityContext,
  type AnnotationVisibilityContextType,
} from "./AnnotationVisibilityContext";
import {
  AnnotationsContext,
  type AnnotationsContextType,
} from "./AnnotationsContext";
import type { BaseAnnotationEntry } from "../types/annotationEntry";

type AnnotationContextsProviderProps<
  TMode extends string,
  TAnnotation extends BaseAnnotationEntry
> = {
  annotationsValue: AnnotationsContextType<TMode, TAnnotation>;
  selectionValue: AnnotationSelectionContextType;
  modeOptionsValue: AnnotationModeOptionsContextType;
  visibilityValue: AnnotationVisibilityContextType<TMode>;
  editValue: AnnotationEditContextType;
  children: ReactNode;
};

export const AnnotationContextsProvider = <
  TMode extends string,
  TAnnotation extends BaseAnnotationEntry
>({
  annotationsValue,
  selectionValue,
  modeOptionsValue,
  visibilityValue,
  editValue,
  children,
}: AnnotationContextsProviderProps<TMode, TAnnotation>) => (
  <AnnotationsContext.Provider value={annotationsValue}>
    <AnnotationSelectionContext.Provider value={selectionValue}>
      <AnnotationModeOptionsContext.Provider value={modeOptionsValue}>
        <AnnotationVisibilityContext.Provider value={visibilityValue}>
          <AnnotationEditContext.Provider value={editValue}>
            {children}
          </AnnotationEditContext.Provider>
        </AnnotationVisibilityContext.Provider>
      </AnnotationModeOptionsContext.Provider>
    </AnnotationSelectionContext.Provider>
  </AnnotationsContext.Provider>
);
