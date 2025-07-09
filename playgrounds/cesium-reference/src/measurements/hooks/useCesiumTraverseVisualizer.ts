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
  mousePosition: Cartesian3 | null = null
) {
  const traverseEntiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
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
        const baseId = entity.id.replace(
          /^(point|segment|total|polyline)-/,
          "traverse-"
        );
        if (!currentIds.has(baseId)) {
          entitiesToRemove.push(entity);
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

    if (!showTraverse) {
      clearVisualizations();
      return;
    }

    // Render completed traverses
    traverses.forEach((traverse) => {
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
    if (!viewer || viewer.isDestroyed() || !mousePosition) return;

    // Find the currently active traverse (incomplete one)
    const activeTraverse = traverses.find((traverse) => {
      // A traverse is "active" if it has at least one point but isn't finished yet
      // We can determine this by checking if it was recently updated
      const isRecent = Date.now() - traverse.timestamp < 5000; // 5 second window
      return isRecent && traverse.geometryECEF.length > 0;
    });

    if (!activeTraverse || activeTraverse.geometryECEF.length === 0) {
      // Clean up preview entities
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
      previewLabel.position = new ConstantPositionProperty(
        Cartesian3.midpoint(lastPoint, mousePosition, new Cartesian3())
      );
      if (previewLabel.label) {
        previewLabel.label.text = new ConstantProperty(
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
          positions: [lastPoint, mousePosition],
          width: 2,
          material: Color.YELLOW.withAlpha(0.7),
          clampToGround: false,
        },
      });
      viewer.entities.add(previewLine);
      traverseEntiesRef.current.push(previewLine);
    } else {
      if (previewLine.polyline) {
        previewLine.polyline.positions = new ConstantProperty([
          lastPoint,
          mousePosition,
        ]);
      }
    }

    requestRender();
  }, [viewer, mousePosition, traverses, requestRender]);

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
