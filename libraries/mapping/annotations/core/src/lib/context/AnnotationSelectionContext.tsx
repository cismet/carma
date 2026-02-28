import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type AnnotationSelectionContextType = {
  selectedMeasurementId: string | null;
  selectedMeasurementIds: string[];
  selectMeasurementById: (id: string | null) => void;
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
  selectionModeActive: boolean;
  setSelectionModeActive: Dispatch<SetStateAction<boolean>>;
  selectModeAdditive: boolean;
  setSelectModeAdditive: Dispatch<SetStateAction<boolean>>;
  selectModeRectangle: boolean;
  setSelectModeRectangle: Dispatch<SetStateAction<boolean>>;
  effectiveSelectModeAdditive: boolean;
};

export const AnnotationSelectionContext = createContext<
  AnnotationSelectionContextType | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnotationSelection = (): AnnotationSelectionContextType => {
  const context = useContext(AnnotationSelectionContext);
  if (!context) {
    throw new Error(
      "useAnnotationSelection must be used within a AnnotationSelectionContext.Provider"
    );
  }
  return context;
};
