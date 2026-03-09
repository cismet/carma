import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  PlanarToolCreationMode,
  PolygonSurfacePreset,
} from "./annotationModeOptions.types";
import type { LinearSegmentLineMode } from "../types/linearSegment";
import type { PlanarPolygonGroup } from "../types/planarTypes";

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
  planarToolCreationMode: PlanarToolCreationMode;
  setPlanarToolCreationMode: Dispatch<SetStateAction<PlanarToolCreationMode>>;
  polygonSurfaceTypePreset: PolygonSurfacePreset;
  setPolygonSurfaceTypePreset: Dispatch<SetStateAction<PolygonSurfacePreset>>;
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
