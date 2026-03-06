import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  PlanarPolygonGroup,
  LinearSegmentLineMode,
  PlanarMeasurementCreationMode,
  PlanarSurfaceType,
} from "../types/annotationTypes";

export type AnnotationModeOptionsContextType = {
  planarPolygonGroups: PlanarPolygonGroup[];
  polylineGroups: PlanarPolygonGroup[];
  areaPolygonGroups: PlanarPolygonGroup[];
  planarSurfacePolygonGroups: PlanarPolygonGroup[];
  verticalPolygonGroups: PlanarPolygonGroup[];
  distanceModeStickyToFirstPoint: boolean;
  setDistanceModeStickyToFirstPoint: Dispatch<SetStateAction<boolean>>;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  setDistanceCreationLineVisibilityByKind: (
    kind: "direct" | "vertical" | "horizontal",
    visible: boolean
  ) => void;
  polylineVerticalOffsetMeters: number;
  setPolylineVerticalOffsetMeters: Dispatch<SetStateAction<number>>;
  polylineSegmentLineMode: LinearSegmentLineMode;
  setPolylineSegmentLineMode: Dispatch<SetStateAction<LinearSegmentLineMode>>;
  planarMeasurementCreationMode: PlanarMeasurementCreationMode;
  setPlanarMeasurementCreationMode: Dispatch<
    SetStateAction<PlanarMeasurementCreationMode>
  >;
  polygonSurfaceTypePreset: PlanarSurfaceType;
  setPolygonSurfaceTypePreset: Dispatch<SetStateAction<PlanarSurfaceType>>;
};

export const AnnotationModeOptionsContext = createContext<
  AnnotationModeOptionsContextType | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnotationModeOptions =
  (): AnnotationModeOptionsContextType => {
    const context = useContext(AnnotationModeOptionsContext);
    if (!context) {
      throw new Error(
        "useAnnotationModeOptions must be used within a AnnotationModeOptionsContext.Provider"
      );
    }
    return context;
  };
