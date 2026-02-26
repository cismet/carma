import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type MeasurementVisibilityContextType<TMode extends string = string> = {
  hideMeasurementsOfType: Set<TMode>;
  setHideMeasurementsOfType: Dispatch<SetStateAction<Set<TMode>>>;
  hideLabelsOfType: Set<TMode>;
  setHideLabelsOfType: Dispatch<SetStateAction<Set<TMode>>>;
};

export const MeasurementVisibilityContext = createContext<
  MeasurementVisibilityContextType<any> | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useMeasurementVisibility = <
  TMode extends string = string
>(): MeasurementVisibilityContextType<TMode> => {
  const context = useContext(MeasurementVisibilityContext);
  if (!context) {
    throw new Error(
      "useMeasurementVisibility must be used within a MeasurementVisibilityContext.Provider"
    );
  }
  return context as unknown as MeasurementVisibilityContextType<TMode>;
};
