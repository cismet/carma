import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  PlanarPolygonGroup,
  PolylineSegmentLineMode,
  SurfaceType,
} from "../types/measurementTypes";

export type MeasurementModeOptionsContextType = {
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
  polylineSegmentLineMode: PolylineSegmentLineMode;
  setPolylineSegmentLineMode: Dispatch<SetStateAction<PolylineSegmentLineMode>>;
  planarMeasurementCreationMode: "polyline" | "polygon";
  setPlanarMeasurementCreationMode: Dispatch<
    SetStateAction<"polyline" | "polygon">
  >;
  polygonSurfaceTypePreset: SurfaceType;
  setPolygonSurfaceTypePreset: Dispatch<SetStateAction<SurfaceType>>;
};

export const MeasurementModeOptionsContext = createContext<
  MeasurementModeOptionsContextType | undefined
>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useMeasurementModeOptions =
  (): MeasurementModeOptionsContextType => {
    const context = useContext(MeasurementModeOptionsContext);
    if (!context) {
      throw new Error(
        "useMeasurementModeOptions must be used within a MeasurementModeOptionsContext.Provider"
      );
    }
    return context;
  };
