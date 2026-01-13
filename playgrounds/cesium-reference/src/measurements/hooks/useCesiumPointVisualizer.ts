import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian2,
  Color,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  VerticalOrigin,
  type Scene,
} from "cesium";

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
import { formatNumberToEnclosed, LABEL_FONT } from "../utils/cesiumLabels";
import { useCesiumPointLabels } from "./useCesiumPointLabels";

export const useCesiumPointVisualizer = (
  scene: Scene | null,
  measurements: MeasurementCollection = [],
  showMarkers: boolean = true,
  showCesiumMarkers: boolean = false,
  showLabels: boolean = false,
  showCesiumLabels: boolean = false,
  radius: number,
  referenceElevation: number = 0,
  debug: boolean = false
) => {
  const labelCollectionRef = useRef<LabelCollection | null>(null);
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
  useCesiumPointLabels(scene, points, showLabels, referenceElevation);

  // Initialize and clean up LabelCollection
  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    const labels = scene.primitives.add(new LabelCollection());
    labelCollectionRef.current = labels;

    return () => {
      if (scene && !scene.isDestroyed()) {
        scene.primitives.remove(labels);
      }
      labelCollectionRef.current = null;
    };
  }, [scene]);

  useEffect(() => {
    // render markers using primitives instead of entities
    if (!showCesiumMarkers || !scene) return;
    const crosses = cross3DRefs.current;

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
        //console.debug(`[CesiumPointVisualizer] Updating visibility for cross3D ${id}`);
        update3dCrossVisibility(crosses[id], showMarkers);
      }
    });
    // Remove refs for points that no longer exist
    Object.keys(crosses).forEach((id) => {
      if (!currentIds.has(id)) {
        if (scene) {
          crosses[id].cleanup(scene);
        }
        delete crosses[id];
      }
    });
    prevIdsRef.current = currentIds;
    if (scene) {
      scene.requestRender(); // Ensure scene updates after changes
    }
    return () => {
      if (!scene) {
        return;
      }

      try {
        Object.keys(crosses).forEach((id) => {
          if (!currentIds.has(id)) {
            crosses[id].cleanup(scene);
            delete crosses[id];
          }
        });
        prevIdsRef.current = new Set();
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

  useEffect(() => {
    // render Labels using LabelCollection primitive
    if (!scene || scene.isDestroyed()) return;

    const labels = labelCollectionRef.current;
    if (!labels) return;

    // Clear and rebuild labels
    // This is efficient enough for small collections (< 1000)
    labels.removeAll();

    if (showCesiumLabels) {
      points.forEach((m, i) => {
        labels.add({
          position: m.geometryECEF,
          text: `${formatNumberToEnclosed(i + 1)} ${(
            m.geometryWGS84.height - referenceElevation
          ).toFixed(2)}m`,
          font: LABEL_FONT,
          fillColor: Color.BLACK,
          showBackground: false,
          outlineColor: Color.WHITE,
          outlineWidth: 5,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(5, -8),
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.BASELINE,
        });
      });
    }

    prevIdsRef.current = currentIds;
    scene.requestRender(); // Ensure scene updates after changes
  }, [scene, points, currentIds, showCesiumLabels, referenceElevation]);
};

export default useCesiumPointVisualizer;
