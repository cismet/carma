import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  BaseMeasurementEntry,
  MeasurementLabelAppearance,
} from "../types/measurementTypes";

export type MeasurementListType<TMode extends string = string> =
  | TMode
  | "pointMeasure"
  | "distanceMeasure"
  | "pointLabel";

export type MeasurementCreatePayload<
  TMeasurement extends BaseMeasurementEntry = BaseMeasurementEntry
> = Omit<TMeasurement, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};

export type MeasurementsContextType<
  TMode extends string = string,
  TMeasurement extends BaseMeasurementEntry = BaseMeasurementEntry
> = {
  measurementMode: TMode;
  setMeasurementMode: Dispatch<SetStateAction<TMode>>;
  measurements: TMeasurement[];
  liveMeasurementCandidate: TMeasurement | null;
  measurementsByType: (type: MeasurementListType<TMode>) => TMeasurement[];
  getMeasurementsForNavigation: () => TMeasurement[];
  getMeasurementIndexByType: (
    type: MeasurementListType<TMode>,
    id: string | null | undefined
  ) => number;
  getMeasurementOrderByType: (
    type: MeasurementListType<TMode>,
    id: string | null | undefined
  ) => number | null;
  getNextMeasurementOrderByType: (type: MeasurementListType<TMode>) => number;
  addMeasurement: (payload: MeasurementCreatePayload<TMeasurement>) => string;
  updateMeasurementById: (id: string, patch: Partial<TMeasurement>) => void;
  deleteMeasurementById: (id: string) => void;
  deleteMeasurementsByIds: (ids: string[]) => void;
  setMeasurements: Dispatch<SetStateAction<TMeasurement[]>>;
  updateMeasurementNameById: (id: string, name: string) => void;
  updatePointLabelAppearanceById: (
    id: string,
    appearance: MeasurementLabelAppearance | undefined
  ) => void;
  toggleMeasurementLockById: (id: string) => void;
  clearMeasurementsByIds: (ids: string[]) => void;
  deleteSelectedPointMeasurements: () => void;
  setPointMeasurementElevationById: (
    id: string,
    elevationMeters: number
  ) => void;
  setPointMeasurementCoordinatesById: (
    id: string,
    latitude: number,
    longitude: number,
    elevationMeters?: number
  ) => void;
  temporaryMode: boolean;
  setTemporaryMode: Dispatch<SetStateAction<boolean>>;
  pointVerticalOffsetMeters: number;
  setPointVerticalOffsetMeters: Dispatch<SetStateAction<number>>;
  pointLabelOnCreate: boolean;
  setPointLabelOnCreate: Dispatch<SetStateAction<boolean>>;
  showLabels: boolean;
  setShowLabels: Dispatch<SetStateAction<boolean>>;
};

export const MeasurementsContext = createContext<
  MeasurementsContextType<any, any> | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useMeasurements = <
  TMode extends string = string,
  TMeasurement extends BaseMeasurementEntry = BaseMeasurementEntry
>(): MeasurementsContextType<TMode, TMeasurement> => {
  const context = useContext(MeasurementsContext);
  if (!context) {
    throw new Error(
      "useMeasurements must be used within a MeasurementsContext.Provider"
    );
  }
  return context as MeasurementsContextType<TMode, TMeasurement>;
};
