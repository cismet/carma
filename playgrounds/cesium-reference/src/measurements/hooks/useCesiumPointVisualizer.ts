import { useEffect, useMemo, useRef } from "react";

import { type Viewer, Entity, Color } from "cesium";

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
  createLabelEntity,
  formatNumberToEnclosed,
} from "../utils/cesiumLabels";
import { useCesiumPointLabels } from "./useCesiumPointLabels";

export const useCesiumPointVisualizer = (
  viewer: Viewer | null,
  measurements: MeasurementCollection = [],
  showMarkers: boolean = true,
  showCesiumMarkers: boolean = false,
  showLabels: boolean = false,
  showCesiumLabels: boolean = false,
  radius: number,
  referenceElevation: number = 0,
  debug: boolean = false
) => {
  const labelRefs = useRef<Record<string, Entity>>({});
  const cross3DRefs = useRef<Record<string, Cross3DGroup>>({});
  const prevIdsRef = useRef<Set<string>>(new Set());

  const [points, currentIds]: [PointMeasurementEntry[], Set<string>] =
    useMemo(() => {
      // memoize derived values of measurements
      const points = measurements.filter(isPointMeasurementEntry);
      const currentIds = new Set(points.map((m) => m.id));
      return [points, currentIds];
    }, [measurements]);

  // Use overlay labels instead of Cesium entity labels
  useCesiumPointLabels(points, showLabels, referenceElevation);

  useEffect(() => {
    // render markers
    if (!showCesiumMarkers || !viewer || viewer.isDestroyed()) return;
    const crosses = cross3DRefs.current;

    points.forEach(({ id, geometryECEF }) => {
      if (!crosses[id]) {
        const cross3D = create3DCrossGroup({
          position: geometryECEF,
          radius,
          width: 1,
          id: `debugMarker-${id}`,
          xyCirclePlane: true,
          colorCircle: Color.WHITE.withAlpha(0.3),
          show: showMarkers,
          showAxes: debug,
        });
        update3dCrossVisibility(cross3D, showMarkers);
        cross3D.addToViewer(viewer);
        crosses[id] = cross3D;
      } else {
        //console.debug(`[CesiumPointVisualizer] Updating visibility for cross3D ${id}`);
        update3dCrossVisibility(crosses[id], showMarkers);
      }
    });
    // Remove refs for points that no longer exist
    Object.keys(crosses).forEach((id) => {
      if (!currentIds.has(id)) {
        crosses[id].cleanup(viewer);
        delete crosses[id];
      }
    });
    prevIdsRef.current = currentIds;
    viewer.scene.requestRender(); // Ensure scene updates after changes
    return () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      try {
        Object.keys(crosses).forEach((id) => {
          if (!currentIds.has(id)) {
            crosses[id].cleanup(viewer);
            delete crosses[id];
          }
        });
        prevIdsRef.current = new Set();
      } catch (error) {
        console.warn("Cross3D cleanup failed:", error);
      }
    };
  }, [
    viewer,
    points,
    radius,
    currentIds,
    showMarkers,
    showCesiumMarkers,
    debug,
  ]);

  useEffect(() => {
    // render Labels
    if (!viewer || viewer.isDestroyed()) return;
    points.forEach((m, i) => {
      if (!labelRefs.current[m.id]) {
        const entity = createLabelEntity(m, undefined, {
          show: showCesiumLabels,
          text: `${formatNumberToEnclosed(i + 1)} ${(
            m.geometryWGS84.height - referenceElevation
          ).toFixed(2)}m`,
        });
        viewer.entities.add(entity);
        labelRefs.current[m.id] = entity;
      }
    });
    prevIdsRef.current = currentIds;
    viewer.scene.requestRender(); // Ensure scene updates after changes
    return () => {
      if (!viewer || viewer.isDestroyed()) {
        return;
      }

      try {
        if (labelRefs.current && viewer.entities) {
          Object.values(labelRefs.current).forEach((entity) => {
            if (viewer && viewer.entities) {
              viewer.entities.remove(entity);
            }
          });
        }
        labelRefs.current = {};
        prevIdsRef.current = new Set();
      } catch (error) {
        console.warn("Label entity cleanup failed", error);
      }
    };
  }, [viewer, points, currentIds, showCesiumLabels, referenceElevation]);
};

export default useCesiumPointVisualizer;
