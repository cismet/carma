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

export type AnnotationListType<TMode extends string = string> =
  | TMode
  | "pointMeasure"
  | "distanceMeasure"
  | "pointLabel";

export type AnnotationCreatePayload<
  TMeasurement extends BaseMeasurementEntry = BaseMeasurementEntry
> = Omit<TMeasurement, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};

export type AnnotationMeasurementsContextType<
  TMode extends string = string,
  TMeasurement extends BaseMeasurementEntry = BaseMeasurementEntry
> = {
  measurementMode: TMode;
  setMeasurementMode: Dispatch<SetStateAction<TMode>>;
  measurements: TMeasurement[];
  liveMeasurementCandidate: TMeasurement | null;
  measurementsByType: (type: AnnotationListType<TMode>) => TMeasurement[];
  getMeasurementsForNavigation: () => TMeasurement[];
  getMeasurementIndexByType: (
    type: AnnotationListType<TMode>,
    id: string | null | undefined
  ) => number;
  getMeasurementOrderByType: (
    type: AnnotationListType<TMode>,
    id: string | null | undefined
  ) => number | null;
  getNextMeasurementOrderByType: (type: AnnotationListType<TMode>) => number;
  addMeasurement: (payload: AnnotationCreatePayload<TMeasurement>) => string;
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
  labelInputPromptPointId: string | null;
  confirmPointLabelInputById: (id: string) => void;
  showLabels: boolean;
  setShowLabels: Dispatch<SetStateAction<boolean>>;
};

export const AnnotationMeasurementsContext = createContext<
  AnnotationMeasurementsContextType<any, any> | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnotationMeasurements = <
  TMode extends string = string,
  TMeasurement extends BaseMeasurementEntry = BaseMeasurementEntry
>(): AnnotationMeasurementsContextType<TMode, TMeasurement> => {
  const context = useContext(AnnotationMeasurementsContext);
  if (!context) {
    throw new Error(
      "useAnnotationMeasurements must be used within a AnnotationMeasurementsContext.Provider"
    );
  }
  return context as AnnotationMeasurementsContextType<TMode, TMeasurement>;
};
