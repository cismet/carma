import { useEffect, useMemo, useRef } from "react";
import { type Viewer, Entity, Cartesian2, Color } from "cesium";
import { create3DCrossGroup, Cross3DGroup } from "../utils/cesium3DCross";
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPoints";
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  PointMeasurementEntry,
} from "../types/MeasurementTypes";

export const useCesiumPointVisualizer = (
  viewer: Viewer | null,
  measurements: MeasurementCollection = [],
  radius: number
) => {
  const entityRefs = useRef<Record<string, Entity>>({});
  const cross3DRefs = useRef<Record<string, Cross3DGroup>>({});
  const prevIdsRef = useRef<Set<string>>(new Set());

  const [points, currentIds]: [PointMeasurementEntry[], Set<string>] =
    useMemo(() => {
      // memoize derived values of measurements
      const points = measurements.filter(isPointMeasurementEntry);
      const currentIds = new Set(points.map((m) => m.id));
      return [points, currentIds];
    }, [measurements]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    // Remove entities/crosses that are no longer present
    prevIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        if (entityRefs.current[id]) {
          viewer.entities.remove(entityRefs.current[id]);
          delete entityRefs.current[id];
        }
        if (cross3DRefs.current[id]) {
          cross3DRefs.current[id].cleanup(viewer);
          delete cross3DRefs.current[id];
        }
      }
    });
    points.forEach((m, i) => {
      if (!entityRefs.current[m.id]) {
        const entity = new Entity({
          id: m.id,
          name: m.name,
          position: m.geometryECEF,
          label: {
            text: `P${i + 1} ${m.geometryWGS84.height.toFixed(2)}`,
            font: LABEL_FONT,
            fillColor: Color.WHITESMOKE,
            showBackground: true,
            backgroundColor: Color.BLACK.withAlpha(0.5),
            backgroundPadding: new Cartesian2(12, 6),
            style: 0,
            pixelOffset: new Cartesian2(0, 40),
            scaleByDistance: SCALE_BY_DISTANCE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        viewer.entities.add(entity);
        entityRefs.current[m.id] = entity;
        const cross3D = create3DCrossGroup({
          position: m.geometryECEF,
          radius,
          color: Color.ORANGE,
          width: 2,
          id: `debugMarker-${m.id}`,
          xyCirclePlane: true,
          colorCircle: Color.WHITE.withAlpha(0.3),
        });
        cross3D.addToViewer(viewer);
        cross3DRefs.current[m.id] = cross3D;
      }
    });
    prevIdsRef.current = currentIds;
    viewer.scene.requestRender(); // Ensure scene updates after changes
    return () => {
      Object.values(entityRefs.current).forEach((entity) =>
        viewer.entities.remove(entity)
      );
      Object.values(cross3DRefs.current).forEach((cross3D) =>
        cross3D.cleanup(viewer)
      );
      entityRefs.current = {};
      cross3DRefs.current = {};
      prevIdsRef.current = new Set();
    };
  }, [viewer, points, radius, currentIds]);
};

export default useCesiumPointVisualizer;
