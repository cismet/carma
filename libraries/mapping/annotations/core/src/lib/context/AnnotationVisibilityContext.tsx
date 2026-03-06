import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type AnnotationVisibilityContextType<TMode extends string = string> = {
  hideMeasurementsOfType: Set<TMode>;
  setHideMeasurementsOfType: Dispatch<SetStateAction<Set<TMode>>>;
  hideLabelsOfType: Set<TMode>;
  setHideLabelsOfType: Dispatch<SetStateAction<Set<TMode>>>;
};

export const AnnotationVisibilityContext = createContext<
  AnnotationVisibilityContextType<any> | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnotationVisibility = <
  TMode extends string = string
>(): AnnotationVisibilityContextType<TMode> => {
  const context = useContext(AnnotationVisibilityContext);
  if (!context) {
    throw new Error(
      "useAnnotationVisibility must be used within a AnnotationVisibilityContext.Provider"
    );
  }
  return context as unknown as AnnotationVisibilityContextType<TMode>;
};
