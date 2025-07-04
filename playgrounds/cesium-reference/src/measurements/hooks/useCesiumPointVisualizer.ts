import { useEffect, useMemo, useRef } from "react";
import { type Viewer, Entity, Cartesian2, Color } from "cesium";
import {
  create3DCrossGroup,
  Cross3DGroup,
  update3dCrossVisibility,
} from "../utils/cesium3DCross";
import { LABEL_FONT, SCALE_BY_DISTANCE } from "./useNivPoints";
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  PointMeasurementEntry,
} from "../types/MeasurementTypes";
import { c } from "node_modules/vite/dist/node/types.d-aGj9QkWt";

export const useCesiumPointVisualizer = (
  viewer: Viewer | null,
  measurements: MeasurementCollection = [],
  showMarkers: boolean = true,
  showLabels: boolean = false,
  radius: number
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

  useEffect(() => {
    // render markers
    if (!viewer || viewer.isDestroyed()) return;
    const crosses = cross3DRefs.current;

    points.forEach(({ id, geometryECEF }) => {
      if (!crosses[id]) {
        const cross3D = create3DCrossGroup({
          position: geometryECEF,
          radius,
          color: Color.ORANGE,
          width: 2,
          id: `debugMarker-${id}`,
          xyCirclePlane: true,
          colorCircle: Color.WHITE.withAlpha(0.3),
        });
        update3dCrossVisibility(cross3D, showMarkers);
        cross3D.addToViewer(viewer);
        crosses[id] = cross3D;
      } else {
        console.debug(
          `[CesiumPointVisualizer] Updating visibility for cross3D ${id}`
        );
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
      // Only cleanup entities that are not in the next render
      Object.keys(crosses).forEach((id) => {
        if (!currentIds.has(id)) {
          crosses[id].cleanup(viewer);
          delete crosses[id];
        }
      });
      prevIdsRef.current = new Set();
    };
  }, [viewer, points, radius, currentIds, showMarkers]);

  useEffect(() => {
    // render Labels
    if (!viewer || viewer.isDestroyed()) return;
    points.forEach((m, i) => {
      if (!labelRefs.current[m.id]) {
        const entity = new Entity({
          id: m.id,
          name: m.name,
          position: m.geometryECEF,
          label: {
            show: showLabels,
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
        labelRefs.current[m.id] = entity;
      }
    });
    prevIdsRef.current = currentIds;
    viewer.scene.requestRender(); // Ensure scene updates after changes
    return () => {
      Object.values(labelRefs.current).forEach((entity) =>
        viewer.entities.remove(entity)
      );
      labelRefs.current = {};
      prevIdsRef.current = new Set();
    };
  }, [viewer, points, radius, currentIds, showLabels]);
};

export default useCesiumPointVisualizer;
