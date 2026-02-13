import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  SceneTransforms,
  Transforms,
  defined,
  type Scene,
} from "@carma/cesium";
import {
  createDiscVisualizer,
  createLineVisualizer,
  type DiscVisualizer,
  type LineVisualizer,
} from "@carma-mapping/engines/cesium/legacy";
import { useLineVisualizers } from "@carma-providers/label-overlay";

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
import { useCesiumPointMoveGizmo } from "./useCesiumPointMoveGizmo";
import { formatNumber } from "../utils/formatting";

export type CesiumPointVisualizerOptions = {
  showMarkers?: boolean;
  showCesiumMarkers?: boolean;
  showLabels?: boolean;
  radius: number;
  referenceElevation?: number;
  referencePoint?: Cartesian3 | null;
  selectedPointId?: string | null;
  showSelectedReferenceLine?: boolean;
  selectedReferenceLineLabelMinDistancePx?: number;
  showSelectedDisc?: boolean;
  debug?: boolean;
  onPointClick?: (pointId: string) => void;
  onPointDoubleClick?: (pointId: string) => void;
  onPointLongPress?: (pointId: string) => void;
  pointLongPressDurationMs?: number;
  labelLayoutConfig?: CesiumLabelLayoutConfigOverrides;
  distanceToReferenceByPointId?: Readonly<Record<string, number>>;
  moveGizmoPointId?: string | null;
  moveGizmoIsDragging?: boolean;
  onMoveGizmoPointPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  onMoveGizmoDragStateChange?: (isDragging: boolean) => void;
  onMoveGizmoExit?: () => void;
};

const REFERENCE_LINE_EPSILON_METERS = 0.001;

export const useCesiumPointVisualizer = (
  scene: Scene | null,
  measurements: MeasurementCollection = [],
  {
    showMarkers = true,
    showCesiumMarkers = false,
    showLabels = false,
    radius,
    referenceElevation = 0,
    referencePoint = null,
    selectedPointId = null,
    showSelectedReferenceLine = false,
    selectedReferenceLineLabelMinDistancePx = 50,
    showSelectedDisc = false,
    debug = false,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    pointLongPressDurationMs = 300,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    moveGizmoPointId = null,
    moveGizmoIsDragging = false,
    onMoveGizmoPointPositionChange,
    onMoveGizmoDragStateChange,
    onMoveGizmoExit,
  }: CesiumPointVisualizerOptions
) => {
  const cross3DRefs = useRef<Record<string, Cross3DGroup>>({});
  const selectedDiscRef = useRef<DiscVisualizer | null>(null);
  const selectedReferenceLineRef = useRef<LineVisualizer | null>(null);

  const [points, currentIds]: [PointMeasurementEntry[], Set<string>] =
    useMemo(() => {
      // memoize derived values of measurements
      const points = measurements.filter(isPointMeasurementEntry);
      const currentIds = new Set(points.map((m) => m.id));
      return [points, currentIds];
    }, [measurements]);
  const selectedPoint = useMemo(
    () =>
      selectedPointId
        ? points.find((point) => point.id === selectedPointId) ?? null
        : null,
    [points, selectedPointId]
  );
  const shouldShowSelectedReferenceLine = Boolean(
    showSelectedReferenceLine &&
      referencePoint &&
      selectedPoint &&
      Cartesian3.distance(referencePoint, selectedPoint.geometryECEF) >
        REFERENCE_LINE_EPSILON_METERS
  );
  const selectedReferenceLineDistanceText = useMemo(() => {
    if (!referencePoint || !selectedPoint) return "";
    const distanceMeters = Cartesian3.distance(
      referencePoint,
      selectedPoint.geometryECEF
    );
    return `${formatNumber(distanceMeters)} m`;
  }, [referencePoint, selectedPoint]);

  // Use overlay labels instead of Cesium entity labels
  useCesiumPointLabels(
    scene,
    points,
    showLabels,
    referenceElevation,
    selectedPointId,
    moveGizmoPointId,
    moveGizmoIsDragging,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    pointLongPressDurationMs,
    labelLayoutConfig,
    distanceToReferenceByPointId
  );

  useCesiumPointMoveGizmo(scene, {
    points,
    movePointId: moveGizmoPointId,
    radius,
    onPointPositionChange: onMoveGizmoPointPositionChange,
    onDragStateChange: onMoveGizmoDragStateChange,
    onExit: onMoveGizmoExit,
  });
  useLineVisualizers(
    shouldShowSelectedReferenceLine && scene && referencePoint && selectedPoint
      ? [
          {
            id: `selected-reference-${selectedPoint.id}`,
            getCanvasLine: () => {
              if (!scene || scene.isDestroyed()) return null;

              const start = SceneTransforms.worldToWindowCoordinates(
                scene,
                referencePoint
              );
              const end = SceneTransforms.worldToWindowCoordinates(
                scene,
                selectedPoint.geometryECEF
              );

              if (!defined(start) || !defined(end)) return null;
              return {
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
              };
            },
            stroke: "rgba(255, 255, 255, 0.9)",
            strokeWidth: 1.5,
            strokeDasharray: "6 4",
            labelText: selectedReferenceLineDistanceText,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: selectedReferenceLineLabelMinDistancePx,
          },
        ]
      : [],
    shouldShowSelectedReferenceLine
  );

  useEffect(() => {
    if (!scene) return;

    if (selectedDiscRef.current) {
      selectedDiscRef.current.destroy();
      selectedDiscRef.current = null;
    }

    if (!showSelectedDisc) {
      scene.requestRender();
      return;
    }

    if (!selectedPointId) {
      scene.requestRender();
      return;
    }

    const selectedPoint = points.find((point) => point.id === selectedPointId);
    if (!selectedPoint) {
      scene.requestRender();
      return;
    }

    const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(
      selectedPoint.geometryECEF
    );
    const upAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 2, new Cartesian4());
    const upVector = Cartesian3.normalize(
      new Cartesian3(upAxis4.x, upAxis4.y, upAxis4.z),
      new Cartesian3()
    );

    selectedDiscRef.current = createDiscVisualizer(
      `selectedGuide-${selectedPoint.id}`,
      {
        origin: selectedPoint.geometryECEF,
        upVector,
        radius,
        screenPixelRadius: 50,
        color: Color.WHITE.withAlpha(0.65),
        width: 1,
        segmentCount: 48,
      }
    );
    selectedDiscRef.current.attach(scene, () => scene.requestRender());
    scene.requestRender();

    return () => {
      if (selectedDiscRef.current) {
        selectedDiscRef.current.destroy();
        selectedDiscRef.current = null;
      }
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [scene, points, selectedPointId, radius, showSelectedDisc]);

  useEffect(() => {
    if (!scene) return;

    if (selectedReferenceLineRef.current) {
      selectedReferenceLineRef.current.destroy();
      selectedReferenceLineRef.current = null;
    }

    if (!shouldShowSelectedReferenceLine || !referencePoint || !selectedPoint) {
      scene.requestRender();
      return;
    }

    selectedReferenceLineRef.current = createLineVisualizer(
      `selected-reference-line-${selectedPoint.id}`,
      {
        start: referencePoint,
        end: selectedPoint.geometryECEF,
        color: Color.WHITE,
        width: 1,
        dashed: false,
      }
    );

    selectedReferenceLineRef.current.attach(scene, () => scene.requestRender());
    scene.requestRender();

    return () => {
      if (selectedReferenceLineRef.current) {
        selectedReferenceLineRef.current.destroy();
        selectedReferenceLineRef.current = null;
      }
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [scene, referencePoint, selectedPoint, shouldShowSelectedReferenceLine]);

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
