import { useEffect, useRef, useMemo, useCallback } from "react";
import {
  Cartesian3,
  Color,
  Entity,
  Viewer,
  ConstantProperty,
  ConstantPositionProperty,
} from "cesium";
import {
  isTraverseMeasurementEntry,
  MeasurementCollection,
  TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { createPointEntity } from "../utils/cesiumTraverseEntities";
import { formatDistance } from "../../utils/formatters";
import { createSegmentLabel, createTotalLabel } from "../utils/cesiumLabels";
import { useRequestRender } from "./useRequestRender";

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
        // Extract traverse ID from entity ID
        // Entity IDs are like: "point-traverse-123456789-0", "segment-traverse-123456789-1", etc.
        // We want to extract: "traverse-123456789"
        const match = entity.id.match(
          /^(point|segment|total|polyline)-(traverse-\d+)/
        );
        if (match) {
          const traverseId = match[2]; // "traverse-123456789"
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
      // Point markers
      traverse.geometryECEF.forEach((point, index) => {
        const pointId = `point-${traverse.id}-${index}`;
        if (!viewer.entities.getById(pointId)) {
          const cumulativeLength =
            traverse.derived.segmentLengthsCumulative[index] || 0;
          const pointEntity = createPointEntity(
            point,
            index,
            cumulativeLength,
            pointId
          );
          viewer.entities.add(pointEntity);
          traverseEntiesRef.current.push(pointEntity);
        }
      });

      // Segment and total labels
      if (showLabels) {
        for (let i = 1; i < traverse.geometryECEF.length; i++) {
          const segmentId = `segment-${traverse.id}-${i}`;
          if (!viewer.entities.getById(segmentId)) {
            const segmentDistance = traverse.derived.segmentLengths[i] || 0;
            const segmentLabel = createSegmentLabel(
              traverse.geometryECEF[i - 1],
              traverse.geometryECEF[i],
              segmentDistance,
              undefined,
              undefined,
              segmentId
            );
            viewer.entities.add(segmentLabel);
            traverseEntiesRef.current.push(segmentLabel);
          }
        }

        if (traverse.geometryECEF.length >= 2) {
          const totalId = `total-${traverse.id}`;
          if (!viewer.entities.getById(totalId)) {
            const totalLabel = createTotalLabel(
              traverse.geometryECEF,
              traverse.derived.totalLength,
              undefined,
              undefined,
              totalId
            );
            viewer.entities.add(totalLabel);
            traverseEntiesRef.current.push(totalLabel);
          }
        }
      }

      // Polyline
      const polylineId = `polyline-${traverse.id}`;
      if (!viewer.entities.getById(polylineId)) {
        const polylineEntity = new Entity({
          id: polylineId,
          polyline: {
            positions: traverse.geometryECEF,
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
          entity.name === "__previewLabel" || entity.name === "__previewLine"
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
    const segmentDistance = Cartesian3.distance(lastPoint, mousePosition);

    // Update or create preview segment label
    let previewLabel = traverseEntiesRef.current.find(
      (entity) => entity.name === "__previewLabel"
    );

    if (!previewLabel) {
      previewLabel = createSegmentLabel(
        lastPoint,
        mousePosition,
        segmentDistance
      );
      previewLabel.name = "__previewLabel";
      viewer.entities.add(previewLabel);
      traverseEntiesRef.current.push(previewLabel);
    } else {
      const midpoint = Cartesian3.midpoint(
        lastPoint,
        mousePosition,
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
          positions: new ConstantProperty([lastPoint, mousePosition]),
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
          lastPoint,
          mousePosition,
        ]);
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
