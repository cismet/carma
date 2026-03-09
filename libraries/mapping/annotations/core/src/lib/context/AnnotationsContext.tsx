import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { BaseAnnotationEntry } from "../types/annotationEntry";
import type { AnnotationLabelAppearance } from "../types/annotationLabel";

export type AnnotationListType<TMode extends string = string> =
  | TMode
  | "pointMeasure"
  | "distanceMeasure"
  | "pointLabel";

export type AnnotationCreatePayload<
  TMeasurement extends BaseAnnotationEntry = BaseAnnotationEntry
> = Omit<TMeasurement, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};

export type AnnotationsContextType<
  TMode extends string = string,
  TMeasurement extends BaseAnnotationEntry = BaseAnnotationEntry
> = {
  annotationMode: TMode;
  setAnnotationMode: Dispatch<SetStateAction<TMode>>;
  annotations: TMeasurement[];
  annotationCandidate: TMeasurement | null;
  annotationsByType: (type: AnnotationListType<TMode>) => TMeasurement[];
  getAnnotationsForNavigation: () => TMeasurement[];
  getAnnotationIndexByType: (
    type: AnnotationListType<TMode>,
    id: string | null | undefined
  ) => number;
  getAnnotationOrderByType: (
    type: AnnotationListType<TMode>,
    id: string | null | undefined
  ) => number | null;
  getNextAnnotationOrderByType: (type: AnnotationListType<TMode>) => number;
  addAnnotation: (payload: AnnotationCreatePayload<TMeasurement>) => string;
  updateAnnotationById: (id: string, patch: Partial<TMeasurement>) => void;
  deleteAnnotationById: (id: string) => void;
  deleteAnnotationsByIds: (ids: string[]) => void;
  setAnnotations: Dispatch<SetStateAction<TMeasurement[]>>;
  updateAnnotationNameById: (id: string, name: string) => void;
  updatePointLabelAppearanceById: (
    id: string,
    appearance: AnnotationLabelAppearance | undefined
  ) => void;
  toggleAnnotationLockById: (id: string) => void;
  clearAllMeasurements: () => void;
  clearAnnotationsByIds: (ids: string[]) => void;
  deleteSelectedPointAnnotations: () => void;
  setPointAnnotationElevationById: (
    id: string,
    elevationMeters: number
  ) => void;
  setPointAnnotationCoordinatesById: (
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

export const AnnotationsContext = createContext<
  AnnotationsContextType<any, any> | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnotations = <
  TMode extends string = string,
  TMeasurement extends BaseAnnotationEntry = BaseAnnotationEntry
>(): AnnotationsContextType<TMode, TMeasurement> => {
  const context = useContext(AnnotationsContext);
  if (!context) {
    throw new Error(
      "useAnnotations must be used within an AnnotationsContext.Provider"
    );
  }
  return context as AnnotationsContextType<TMode, TMeasurement>;
};
