import { createContext, useContext } from "react";

export type AnnotationEditContextType = {
  lockedEditMeasurementId: string | null;
  clearLockedEditMeasurementId: () => void;
};

export const AnnotationEditContext = createContext<
  AnnotationEditContextType | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnotationEdit = (): AnnotationEditContextType => {
  const context = useContext(AnnotationEditContext);
  if (!context) {
    throw new Error(
      "useAnnotationEdit must be used within a AnnotationEditContext.Provider"
    );
  }
  return context;
};
