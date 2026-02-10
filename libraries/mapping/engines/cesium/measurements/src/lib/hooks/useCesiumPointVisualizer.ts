import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian2,
  Color,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  VerticalOrigin,
  type Scene,
} from "@carma/cesium";

import { formatNumberToEnclosed } from "@carma-providers/label-overlay";

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

// Font for deprecated Cesium labels - will be removed when Cesium labels are fully deprecated
const LABEL_FONT = '10px "Helvetica Neue", Arial, Helvetica, sans-serif';

export type CesiumPointVisualizerOptions = {
  showMarkers?: boolean;
  showCesiumMarkers?: boolean;
  showLabels?: boolean;
  showCesiumLabels?: boolean;
  radius: number;
  referenceElevation?: number;
  debug?: boolean;
  onPointClick?: (pointId: string) => void;
  labelLayoutConfig?: CesiumLabelLayoutConfigOverrides;
};

export const useCesiumPointVisualizer = (
  scene: Scene | null,
  measurements: MeasurementCollection = [],
  {
    showMarkers = true,
    showCesiumMarkers = false,
    showLabels = false,
    showCesiumLabels = false,
    radius,
    referenceElevation = 0,
    debug = false,
    onPointClick,
    labelLayoutConfig,
  }: CesiumPointVisualizerOptions
) => {
  const labelCollectionRef = useRef<LabelCollection | null>(null);
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
    labelLayoutConfig
  );

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

    scene.requestRender(); // Ensure scene updates after changes
  }, [scene, points, currentIds, showCesiumLabels, referenceElevation]);
};

export default useCesiumPointVisualizer;
