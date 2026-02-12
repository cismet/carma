import { useEffect, useMemo, useRef } from "react";

import { type Scene } from "@carma/cesium";

import {
  create3DCrossGroup,
  Cross3DGroup,
  update3dCrossVisibility,
} from "../utils/cesium3DCross";
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  PointMeasurementEntry,
} from "../types/MeasurementTypes";
import {
  useCesiumPointLabels,
  type CesiumLabelLayoutConfigOverrides,
} from "./useCesiumPointLabels";

export type CesiumPointVisualizerOptions = {
  showMarkers?: boolean;
  showCesiumMarkers?: boolean;
  showLabels?: boolean;
  radius: number;
  referenceElevation?: number;
  debug?: boolean;
  onPointClick?: (pointId: string) => void;
  labelLayoutConfig?: CesiumLabelLayoutConfigOverrides;
  distanceToReferenceByPointId?: Readonly<Record<string, number>>;
};

export const useCesiumPointVisualizer = (
  scene: Scene | null,
  measurements: MeasurementCollection = [],
  {
    showMarkers = true,
    showCesiumMarkers = false,
    showLabels = false,
    radius,
    referenceElevation = 0,
    debug = false,
    onPointClick,
    labelLayoutConfig,
    distanceToReferenceByPointId,
  }: CesiumPointVisualizerOptions
) => {
  const cross3DRefs = useRef<Record<string, Cross3DGroup>>({});

  const [points, currentIds]: [PointMeasurementEntry[], Set<string>] =
    useMemo(() => {
      // memoize derived values of measurements
      const points = measurements.filter(isPointMeasurementEntry);
      const currentIds = new Set(points.map((m) => m.id));
      return [points, currentIds];
    }, [measurements]);

  // Use overlay labels instead of Cesium entity labels
  useCesiumPointLabels(
    scene,
    points,
    showLabels,
    referenceElevation,
    onPointClick,
    labelLayoutConfig,
    distanceToReferenceByPointId
  );

  useEffect(() => {
    // render markers using primitives instead of entities
    if (!scene) return;
    const crosses = cross3DRefs.current;

    if (!showCesiumMarkers) {
      Object.keys(crosses).forEach((id) => {
        crosses[id].cleanup(scene);
        delete crosses[id];
      });
      scene.requestRender();
      return;
    }

    points.forEach(({ id, geometryECEF }) => {
      if (!crosses[id]) {
        const cross3D = create3DCrossGroup(scene, {
          position: geometryECEF,
          radius,
          width: 1,
          id: `debugMarker-${id}`,
          showAxes: debug,
        });
        update3dCrossVisibility(cross3D, showMarkers);
        crosses[id] = cross3D;
      } else {
        update3dCrossVisibility(crosses[id], showMarkers);
      }
    });
    // Remove refs for points that no longer exist
    Object.keys(crosses).forEach((id) => {
      if (!currentIds.has(id)) {
        crosses[id].cleanup(scene);
        delete crosses[id];
      }
    });
    scene.requestRender(); // Ensure scene updates after changes

    return () => {
      try {
        Object.keys(crosses).forEach((id) => {
          if (!currentIds.has(id)) {
            crosses[id].cleanup(scene);
            delete crosses[id];
          }
        });
      } catch (error) {
        console.warn("Cross3D primitive cleanup failed:", error);
      }
    };
  }, [
    scene,
    points,
    radius,
    currentIds,
    showMarkers,
    showCesiumMarkers,
    debug,
  ]);
};

export default useCesiumPointVisualizer;
