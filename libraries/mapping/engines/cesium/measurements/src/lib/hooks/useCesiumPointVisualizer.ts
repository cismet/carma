/* @refresh reset */
import { useEffect, useMemo, useRef } from "react";

import {
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  Transforms,
  type Scene,
} from "@carma/cesium";
import {
  createDiscVisualizer,
  type DiscVisualizer,
} from "@carma-mapping/engines/cesium/legacy";

import {
  create3DCrossGroup,
  Cross3DGroup,
  update3dCrossVisibility,
} from "../utils/cesium3DCross";
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  type PlanarPolygonGroup,
  type PlanarPolygonPlane,
  type PointDistanceRelation,
  type PointMeasurementEntry,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import {
  useCesiumPointLabels,
  type CesiumLabelLayoutConfigOverrides,
} from "./useCesiumPointLabels";
import { useCesiumPointMoveGizmo } from "@carma-mapping/engines-interop/gizmo/cesium-integration";
import { useCesiumDistanceVisualizer } from "./useCesiumDistanceVisualizer";

export type CesiumPointVisualizerOptions = {
  showMarkers?: boolean;
  showCesiumMarkers?: boolean;
  showLabels?: boolean;
  radius: number;
  referenceElevation?: number;
  selectedPointId?: string | null;
  selectedPointIds?: string[];
  selectedPlanarPolygonGroupId?: string | null;
  activePlanarPolygonGroupId?: string | null;
  distanceRelations?: PointDistanceRelation[];
  planarPolygonGroups?: PlanarPolygonGroup[];
  onPlanarPolygonClick?: (polygonGroupId: string) => void;
  pointDragPlaneByPointId?: Readonly<Record<string, PlanarPolygonPlane>>;
  onPointPlaneDragStart?: (pointId: string) => void;
  onPointPlaneDragPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  onPointPlaneDragEnd?: (pointId: string) => void;
  hiddenPointLabelIds?: ReadonlySet<string>;
  fullyHiddenPointIds?: ReadonlySet<string>;
  markerlessPointIds?: ReadonlySet<string>;
  onDistanceRelationLineLabelToggle?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationLineClick?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationMidpointClick?: (relationId: string) => void;
  distanceLineLabelMinDistancePx?: number;
  cumulativeDistanceByRelationId?: Readonly<Record<string, number>>;
  showSelectedDisc?: boolean;
  debug?: boolean;
  onPointClick?: (pointId: string) => void;
  onPointDoubleClick?: (pointId: string) => void;
  onPointLongPress?: (pointId: string) => void;
  selectionModeEnabled?: boolean;
  selectionAdditiveMode?: boolean;
  onPointRectangleSelect?: (pointIds: string[], additive: boolean) => void;
  onDistanceRelationCornerClick?: (relationId: string) => void;
  pointLongPressDurationMs?: number;
  occlusionChecksEnabled?: boolean;
  labelLayoutConfig?: CesiumLabelLayoutConfigOverrides;
  distanceToReferenceByPointId?: Readonly<Record<string, number>>;
  pointLabelIndexByPointId?: Readonly<Record<string, number>>;
  referenceLabelPointId?: string | null;
  polylinePointLabelTextByPointId?: Readonly<Record<string, string>>;
  moveGizmoPointId?: string | null;
  moveGizmoAxisDirection?: Cartesian3 | null;
  moveGizmoAxisTitle?: string | null;
  moveGizmoAxisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
  moveGizmoMarkerSizeScale?: number;
  moveGizmoLabelDistanceScale?: number;
  moveGizmoSnapPlaneDragToGround?: boolean;
  moveGizmoShowRotationHandle?: boolean;
  moveGizmoIsDragging?: boolean;
  onMoveGizmoPointPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  onMoveGizmoDragStateChange?: (isDragging: boolean) => void;
  onMoveGizmoAxisChange?: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
  onMoveGizmoExit?: () => void;
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
    selectedPointId = null,
    selectedPointIds = [],
    selectedPlanarPolygonGroupId = null,
    activePlanarPolygonGroupId = null,
    distanceRelations = [],
    planarPolygonGroups = [],
    onPlanarPolygonClick,
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    onDistanceRelationLineLabelToggle,
    onDistanceRelationLineClick,
    onDistanceRelationMidpointClick,
    distanceLineLabelMinDistancePx = 50,
    cumulativeDistanceByRelationId,
    showSelectedDisc = false,
    debug = false,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    selectionModeEnabled = false,
    selectionAdditiveMode = false,
    onPointRectangleSelect,
    onDistanceRelationCornerClick,
    pointLongPressDurationMs = 300,
    occlusionChecksEnabled = true,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    pointLabelIndexByPointId,
    referenceLabelPointId = null,
    polylinePointLabelTextByPointId,
    moveGizmoPointId = null,
    moveGizmoAxisDirection = null,
    moveGizmoAxisTitle = null,
    moveGizmoAxisCandidates = null,
    moveGizmoMarkerSizeScale = 1,
    moveGizmoLabelDistanceScale = 1,
    moveGizmoSnapPlaneDragToGround = false,
    moveGizmoShowRotationHandle = true,
    moveGizmoIsDragging = false,
    onMoveGizmoPointPositionChange,
    onMoveGizmoDragStateChange,
    onMoveGizmoAxisChange,
    onMoveGizmoExit,
  }: CesiumPointVisualizerOptions
) => {
  const cross3DRefs = useRef<Record<string, Cross3DGroup>>({});
  const selectedDiscRef = useRef<DiscVisualizer | null>(null);

  const [points, currentIds]: [PointMeasurementEntry[], Set<string>] =
    useMemo(() => {
      // memoize derived values of measurements
      const derivedPoints = measurements.filter(isPointMeasurementEntry);
      const ids = new Set(derivedPoints.map((measurement) => measurement.id));
      return [derivedPoints, ids];
    }, [measurements]);

  const moveGizmoPoints = useMemo(
    () =>
      points.map((point) => {
        if (!point.verticalOffsetAnchorECEF) {
          return point;
        }
        return {
          ...point,
          geometryECEF: new Cartesian3(
            point.verticalOffsetAnchorECEF.x,
            point.verticalOffsetAnchorECEF.y,
            point.verticalOffsetAnchorECEF.z
          ),
        };
      }),
    [points]
  );

  // Use overlay labels instead of Cesium entity labels
  useCesiumPointLabels(
    scene,
    points,
    showLabels,
    referenceElevation,
    selectedPointId,
    selectedPointIds,
    moveGizmoPointId,
    moveGizmoIsDragging,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    selectionModeEnabled,
    selectionAdditiveMode,
    onPointRectangleSelect,
    pointLongPressDurationMs,
    occlusionChecksEnabled,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    pointLabelIndexByPointId,
    referenceLabelPointId,
    polylinePointLabelTextByPointId,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    moveGizmoMarkerSizeScale,
    moveGizmoLabelDistanceScale
  );

  useCesiumPointMoveGizmo(scene, {
    points: moveGizmoPoints,
    movePointId: moveGizmoPointId,
    axisDirection: moveGizmoAxisDirection,
    axisTitle: moveGizmoAxisTitle,
    axisCandidates: moveGizmoAxisCandidates,
    snapPlaneDragToGround: moveGizmoSnapPlaneDragToGround,
    showRotationHandle: moveGizmoShowRotationHandle,
    radius,
    onPointPositionChange: onMoveGizmoPointPositionChange,
    onDragStateChange: onMoveGizmoDragStateChange,
    onAxisDirectionChange: onMoveGizmoAxisChange,
    onExit: onMoveGizmoExit,
  });

  useCesiumDistanceVisualizer(scene, points, {
    distanceRelations,
    planarPolygonGroups,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    onPlanarPolygonClick,
    onDistanceLineLabelToggle: onDistanceRelationLineLabelToggle,
    onDistanceLineClick: onDistanceRelationLineClick,
    onDistanceRelationMidpointClick,
    lineLabelMinDistancePx: distanceLineLabelMinDistancePx,
    onDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
  });

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

    const moveGizmoOnSelectedPoint =
      moveGizmoPointId !== null && moveGizmoPointId === selectedPointId;
    if (moveGizmoOnSelectedPoint) {
      // Prevent two overlapping disc polygons (selected-guide + move-gizmo disc),
      // which can produce visual z-fighting artifacts.
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
    const fallbackUpVector = Cartesian3.normalize(
      new Cartesian3(upAxis4.x, upAxis4.y, upAxis4.z),
      new Cartesian3()
    );
    const hasAxisOverride =
      Boolean(moveGizmoAxisDirection) &&
      Cartesian3.magnitudeSquared(moveGizmoAxisDirection as Cartesian3) > 1e-8;
    const discNormal = hasAxisOverride
      ? Cartesian3.normalize(
          moveGizmoAxisDirection as Cartesian3,
          new Cartesian3()
        )
      : fallbackUpVector;

    selectedDiscRef.current = createDiscVisualizer(
      `selectedGuide-${selectedPoint.id}`,
      {
        origin: selectedPoint.geometryECEF,
        upVector: discNormal,
        radius,
        screenPixelRadius: 50,
        color: Color.WHITE.withAlpha(0.5),
        unitCircleSegments: 24,
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
  }, [
    scene,
    points,
    selectedPointId,
    radius,
    showSelectedDisc,
    moveGizmoAxisDirection,
    moveGizmoPointId,
  ]);

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
