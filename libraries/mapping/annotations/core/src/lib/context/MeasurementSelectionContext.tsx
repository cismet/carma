import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type MeasurementSelectionContextType = {
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

export const MeasurementSelectionContext = createContext<
  MeasurementSelectionContextType | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useMeasurementSelection = (): MeasurementSelectionContextType => {
  const context = useContext(MeasurementSelectionContext);
  if (!context) {
    throw new Error(
      "useMeasurementSelection must be used within a MeasurementSelectionContext.Provider"
    );
  }
  return context;
};
