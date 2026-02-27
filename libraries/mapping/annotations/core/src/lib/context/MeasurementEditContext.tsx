import { createContext, useContext } from "react";

export type MeasurementEditContextType = {
  lockedEditMeasurementId: string | null;
  clearLockedEditMeasurementId: () => void;
};

export const MeasurementEditContext = createContext<
  MeasurementEditContextType | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useMeasurementEdit = (): MeasurementEditContextType => {
  const context = useContext(MeasurementEditContext);
  if (!context) {
    throw new Error(
      "useMeasurementEdit must be used within a MeasurementEditContext.Provider"
    );
  }
  return context;
};
