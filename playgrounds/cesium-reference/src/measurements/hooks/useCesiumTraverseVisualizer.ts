import { useEffect, useRef, useMemo, useCallback } from "react";
import {
  Cartesian3,
  Color,
  Entity,
  Viewer,
  ConstantProperty,
  ConstantPositionProperty,
  Transforms,
  Matrix4,
  Ellipsoid,
  Cartesian4,
} from "cesium";
import {
  isTraverseMeasurementEntry,
  MeasurementCollection,
  TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { createPointMarker } from "../utils/cesiumTraverseEntities";
import { formatDistance } from "../../utils/formatters";
import {
  createSegmentLabel,
  createSegmentNodeLabel,
  updateTraverseLabelVisibility,
} from "../utils/cesiumLabels";
import { useRequestRender } from "./useRequestRender";

const getLocalElevatedPoint = (
  position: Cartesian3,
  heightOffset: number,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): Cartesian3 => {
  if (heightOffset === 0) return position;

  // Get the local up direction at this position
  const localToFixedFrame = Transforms.eastNorthUpToFixedFrame(
    position,
    ellipsoid
  );
  const localUp = Matrix4.getColumn(localToFixedFrame, 2, new Cartesian4());

  // Convert to Cartesian3 (ignore w component)
  const upVector = new Cartesian3(localUp.x, localUp.y, localUp.z);

  // Scale the up vector by the height offset
  const offsetVector = Cartesian3.multiplyByScalar(
    upVector,
    heightOffset,
    new Cartesian3()
  );

  // Add the offset to the original position
  return Cartesian3.add(position, offsetVector, new Cartesian3());
};

export function useCesiumTraverseVisualizer(
  viewer: Viewer | null,
  measurements: MeasurementCollection = [],
  showTraverse: boolean = true,
  showLabels: boolean = true,
  mousePosition: Cartesian3 | null = null,
  isActiveTraverse: boolean = false,
  currentTraverseId: string | null = null
) {
  const traverseEntiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const renderedTraversesRef = useRef<Map<string, number>>(new Map());
  const requestRender = useRequestRender(viewer);

  const [traverses, currentIds]: [TraverseMeasurementEntry[], Set<string>] =
    useMemo(() => {
      const traverses = measurements.filter(isTraverseMeasurementEntry);
      const currentIds = new Set(traverses.map((m) => m.id));
      return [traverses, currentIds];
    }, [measurements]);

  const clearVisualizations = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;

    traverseEntiesRef.current.forEach((entity) => {
      try {
        viewer.entities.remove(entity);
      } catch {}
    });
    traverseEntiesRef.current = [];
    renderedTraversesRef.current.clear();

    if (currentPolylineRef.current) {
      try {
        viewer.entities.remove(currentPolylineRef.current);
      } catch {}
      currentPolylineRef.current = null;
    }
  }, [viewer]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Clear existing visualizations for removed measurements
    const entitiesToRemove: Entity[] = [];
    traverseEntiesRef.current.forEach((entity) => {
      if (entity.id) {
        const match = entity.id.match(
          /^(point-marker|point-label|segment|polyline|vertical-line)-(traverse-\d+)/
        );
        if (match) {
          const traverseId = match[2];
          if (!currentIds.has(traverseId)) {
            entitiesToRemove.push(entity);
          }
        }
      }
    });

    entitiesToRemove.forEach((entity) => {
      try {
        viewer.entities.remove(entity);
      } catch {}
      const index = traverseEntiesRef.current.indexOf(entity);
      if (index > -1) {
        traverseEntiesRef.current.splice(index, 1);
      }
    });

    // Remove IDs of deleted traverses from rendered set
    renderedTraversesRef.current.forEach((timestamp, traverseId) => {
      if (!currentIds.has(traverseId)) {
        renderedTraversesRef.current.delete(traverseId);
      }
    });

    if (!showTraverse) {
      clearVisualizations();
      renderedTraversesRef.current.clear();
      return;
    }

    // Only render new or updated traverses
    traverses.forEach((traverse) => {
      const lastRenderedTimestamp = renderedTraversesRef.current.get(
        traverse.id
      );

      // Skip if this traverse is already fully rendered and hasn't changed
      if (
        lastRenderedTimestamp &&
        lastRenderedTimestamp >= traverse.timestamp
      ) {
        return;
      }

      // Remove existing entities for this traverse before re-rendering (only if it needs updating)
      if (lastRenderedTimestamp) {
        const entitiesToRemove = traverseEntiesRef.current.filter((entity) => {
          if (entity.id) {
            return entity.id.includes(traverse.id);
          }
          return false;
        });

        entitiesToRemove.forEach((entity) => {
          try {
            viewer.entities.remove(entity);
          } catch {}
          const index = traverseEntiesRef.current.indexOf(entity);
          if (index > -1) {
            traverseEntiesRef.current.splice(index, 1);
          }
        });
      }
      // Point markers and labels
      traverse.geometryECEF.forEach((point, index) => {
        const pointMarkerId = `point-marker-${traverse.id}-${index}`;
        const pointLabelId = `point-label-${traverse.id}-${index}`;
        const verticalLineId = `vertical-line-${traverse.id}-${index}`;

        // Get heightOffset from measurement data, default to 0 if not set
        const heightOffset = traverse.heightOffset || 0;

        // Create elevated point for visualization if heightOffset > 0
        const visualizationPoint =
          heightOffset > 0 ? getLocalElevatedPoint(point, heightOffset) : point;

        if (!viewer.entities.getById(pointMarkerId)) {
          const pointMarker = createPointMarker(
            visualizationPoint,
            pointMarkerId
          );
          viewer.entities.add(pointMarker);
          traverseEntiesRef.current.push(pointMarker);
        }

        // Add vertical line from ground to elevated point if heightOffset > 0
        if (heightOffset > 0 && !viewer.entities.getById(verticalLineId)) {
          const verticalLine = new Entity({
            id: verticalLineId,
            polyline: {
              positions: [point, visualizationPoint],
              width: 2,
              material: Color.WHITE.withAlpha(0.8),
              clampToGround: false,
            },
          });
          viewer.entities.add(verticalLine);
          traverseEntiesRef.current.push(verticalLine);
        }

        if (!viewer.entities.getById(pointLabelId)) {
          const cumulativeLength =
            traverse.derived.segmentLengthsCumulative[index] || 0;
          const isSingleSegment = traverse.geometryECEF.length === 2;
          const pointLabel = createSegmentNodeLabel(
            visualizationPoint,
            index,
            cumulativeLength,
            pointLabelId,
            isSingleSegment
          );
          viewer.entities.add(pointLabel);
          traverseEntiesRef.current.push(pointLabel);
        }
      });

      // Segment labels
      if (showLabels) {
        const heightOffset = traverse.heightOffset || 0;
        const elevatedPoints =
          heightOffset > 0
            ? traverse.geometryECEF.map((point) =>
                getLocalElevatedPoint(point, heightOffset)
              )
            : traverse.geometryECEF;

        for (let i = 1; i < traverse.geometryECEF.length; i++) {
          const segmentId = `segment-${traverse.id}-${i}`;
          if (!viewer.entities.getById(segmentId)) {
            const segmentDistance = traverse.derived.segmentLengths[i] || 0;
            const segmentLabel = createSegmentLabel(
              elevatedPoints[i - 1],
              elevatedPoints[i],
              segmentDistance,
              segmentId
            );
            viewer.entities.add(segmentLabel);
            traverseEntiesRef.current.push(segmentLabel);
          }
        }
      }

      // Polyline
      const polylineId = `polyline-${traverse.id}`;
      if (!viewer.entities.getById(polylineId)) {
        const heightOffset = traverse.heightOffset || 0;
        const polylinePositions =
          heightOffset > 0
            ? traverse.geometryECEF.map((point) =>
                getLocalElevatedPoint(point, heightOffset)
              )
            : traverse.geometryECEF;

        const polylineEntity = new Entity({
          id: polylineId,
          polyline: {
            positions: polylinePositions,
            width: 3,
            material: Color.LIGHTYELLOW,
            clampToGround: false,
          },
        });
        viewer.entities.add(polylineEntity);
        traverseEntiesRef.current.push(polylineEntity);
      }

      // Mark this traverse as fully rendered
      renderedTraversesRef.current.set(traverse.id, traverse.timestamp);
    });

    prevIdsRef.current = currentIds;
    requestRender();
  }, [
    viewer,
    traverses,
    currentIds,
    showTraverse,
    showLabels,
    clearVisualizations,
    requestRender,
  ]);

  // Handle live preview for active traverse measurement
  useEffect(() => {
    if (
      !viewer ||
      viewer.isDestroyed() ||
      !mousePosition ||
      !isActiveTraverse ||
      !currentTraverseId
    ) {
      // Clean up preview entities when no active traverse
      const previewEntities = traverseEntiesRef.current.filter(
        (entity) =>
          entity.name === "__previewLabel" ||
          entity.name === "__previewLine" ||
          entity.name === "__previewStem"
      );
      previewEntities.forEach((entity) => {
        try {
          viewer.entities.remove(entity);
        } catch {}
        const index = traverseEntiesRef.current.indexOf(entity);
        if (index > -1) {
          traverseEntiesRef.current.splice(index, 1);
        }
      });
      return;
    }

    // Find the currently active traverse by ID
    const activeTraverse = traverses.find(
      (traverse) => traverse.id === currentTraverseId
    );

    if (!activeTraverse || activeTraverse.geometryECEF.length === 0) {
      return;
    }

    const lastPoint =
      activeTraverse.geometryECEF[activeTraverse.geometryECEF.length - 1];
    const heightOffset = activeTraverse.heightOffset || 0;

    // Apply height offset for visualization
    const elevatedLastPoint =
      heightOffset > 0
        ? getLocalElevatedPoint(lastPoint, heightOffset)
        : lastPoint;
    const elevatedMousePosition =
      heightOffset > 0
        ? getLocalElevatedPoint(mousePosition, heightOffset)
        : mousePosition;

    const segmentDistance = Cartesian3.distance(lastPoint, mousePosition);

    // Update or create preview segment label
    let previewLabel = traverseEntiesRef.current.find(
      (entity) => entity.name === "__previewLabel"
    );

    if (!previewLabel) {
      previewLabel = createSegmentLabel(
        elevatedLastPoint,
        elevatedMousePosition,
        segmentDistance
      );
      previewLabel.name = "__previewLabel";
      viewer.entities.add(previewLabel);
      traverseEntiesRef.current.push(previewLabel);
    } else {
      const midpoint = Cartesian3.midpoint(
        elevatedLastPoint,
        elevatedMousePosition,
        new Cartesian3()
      );
      if (previewLabel.position) {
        (previewLabel.position as ConstantPositionProperty).setValue(midpoint);
      }
      if (previewLabel.label && previewLabel.label.text) {
        (previewLabel.label.text as ConstantProperty).setValue(
          formatDistance(segmentDistance)
        );
      }
    }

    // Update or create preview line
    let previewLine = traverseEntiesRef.current.find(
      (entity) => entity.name === "__previewLine"
    );

    if (!previewLine) {
      previewLine = new Entity({
        name: "__previewLine",
        polyline: {
          positions: new ConstantProperty([
            elevatedLastPoint,
            elevatedMousePosition,
          ]),
          width: 2,
          material: Color.YELLOW.withAlpha(0.7),
          clampToGround: false,
        },
      });
      viewer.entities.add(previewLine);
      traverseEntiesRef.current.push(previewLine);
    } else {
      if (previewLine.polyline && previewLine.polyline.positions) {
        (previewLine.polyline.positions as ConstantProperty).setValue([
          elevatedLastPoint,
          elevatedMousePosition,
        ]);
      }
    }

    // Add preview stem line for mouse position if heightOffset > 0
    let previewStem = traverseEntiesRef.current.find(
      (entity) => entity.name === "__previewStem"
    );

    if (heightOffset > 0) {
      if (!previewStem) {
        previewStem = new Entity({
          name: "__previewStem",
          polyline: {
            positions: new ConstantProperty([
              mousePosition,
              elevatedMousePosition,
            ]),
            width: 2,
            material: Color.WHITE.withAlpha(0.6),
            clampToGround: false,
          },
        });
        viewer.entities.add(previewStem);
        traverseEntiesRef.current.push(previewStem);
      } else {
        if (previewStem.polyline && previewStem.polyline.positions) {
          (previewStem.polyline.positions as ConstantProperty).setValue([
            mousePosition,
            elevatedMousePosition,
          ]);
        }
      }
    } else if (previewStem) {
      // Remove stem if heightOffset is 0
      try {
        viewer.entities.remove(previewStem);
      } catch {}
      const index = traverseEntiesRef.current.indexOf(previewStem);
      if (index > -1) {
        traverseEntiesRef.current.splice(index, 1);
      }
    }

    requestRender();
    // Force immediate render for smooth preview updates
    viewer.scene.requestRender();
  }, [
    viewer,
    mousePosition,
    traverses,
    requestRender,
    isActiveTraverse,
    currentTraverseId,
  ]);

  // Handle camera drag/zoom end events to update label visibility
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const handleCameraChange = () => {
      traverses.forEach((traverse) => {
        const traverseEntities = traverseEntiesRef.current.filter((entity) => {
          return entity.id?.includes(traverse.id);
        });

        if (traverseEntities.length > 0) {
          if (showLabels) {
            updateTraverseLabelVisibility(viewer, traverseEntities, traverse);
          } else {
            // Hide all labels when showLabels is false
            traverseEntities.forEach((entity) => {
              if (entity.id?.includes('label') || entity.id?.includes('segment')) {
                entity.show = false;
              }
            });
          }
        }
      });
      requestRender();
    };

    // Add camera event listeners - only on end events for better performance
    const removeMoveEndListener = viewer.camera.moveEnd.addEventListener(handleCameraChange);

    // Initial label visibility update
    handleCameraChange();

    return () => {
      removeMoveEndListener();
    };
  }, [viewer, traverses, showLabels, requestRender]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearVisualizations();
    };
  }, [clearVisualizations]);

  return {
    clearVisualizations,
  };
}
