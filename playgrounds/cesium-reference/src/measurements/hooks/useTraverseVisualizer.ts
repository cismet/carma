
import { useEffect, useRef, useMemo, useCallback } from "react";
import {
  Cartesian3,
  Color,
  Entity,
  Viewer,
  ConstantProperty,
  Transforms,
  Matrix4,
  Ellipsoid,
  Cartesian4,
  PolylineDashMaterialProperty,
  PolylineArrowMaterialProperty,
  PolylineGlowMaterialProperty,
} from "cesium";
import {
  isTraverseMeasurementEntry,
  MeasurementCollection,
  TraverseMeasurementEntry,
} from "../types/MeasurementTypes";
import { createPointMarker } from "../utils/cesiumTraverseEntities";
import {
  createSegmentLabel,
  createSegmentNodeLabel,
  createNodeNumberLabel,
  updateTraverseLabelVisibility,
  createPointLabelText,
} from "../utils/cesiumLabels";
import { useAnnotationOverlayTraverse } from "./useAnnotationOverlayTraverse";

const STEMLINE_MIN_OFFSET = 0.1; // meters

type PolylineMaterial =
  | Color
  | PolylineDashMaterialProperty
  | PolylineArrowMaterialProperty
  | PolylineGlowMaterialProperty;

type TraverseStyleConfig = {
  lineWidth?: number;
  lineMaterial?: PolylineMaterial;
  stemLineWidth?: number;
  stemLineMaterial?: PolylineMaterial;
  previewLineWidth?: number;
  previewLineMaterial?: PolylineMaterial;
};

// rgba(38, 123, 220, 0.83) as in geoportal leaflet-draw-guide-dash
// too dark vs mesh dominant colors
//const PREVIEWLINE_COLOR = Color.fromCssColorString("rgba(38, 123, 220, 0.83)");
const PREVIEWLINE_COLOR = Color.fromCssColorString("rgba(153, 238, 255, 0.83)");

// expose later if this should be configurable
const defaultTraverseStyleConfig: Readonly<TraverseStyleConfig> = {
  lineWidth: 1.5,
  lineMaterial: Color.WHITE,
  stemLineWidth: 0.25,
  stemLineMaterial: Color.WHITE,
  previewLineWidth: 5,
  previewLineMaterial: new PolylineDashMaterialProperty({
    color: PREVIEWLINE_COLOR,
    dashLength: 20.0,
    dashPattern: 15, // 8 bit binary
  }),
};

// Preview-related constants removed - now handled by DOM overlay system

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

export function useTraverseVisualizer(
  viewer: Viewer | null,
  measurements: MeasurementCollection = [],
  showTraverse: boolean = true,
  showLabels: boolean = true,
  showCesiumLabels: boolean = false,
  mousePosition: Cartesian3 | null = null,
  isActiveTraverse: boolean = false,
  currentTraverseId: string | null = null,
  referenceElevation: number = 0
) {
  const traverseEntiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const renderedTraversesRef = useRef<
    Map<string, { timestamp: number; referenceElevation: number }>
  >(new Map());

  const config = defaultTraverseStyleConfig;

  const [traverses, currentIds]: [TraverseMeasurementEntry[], Set<string>] =
    useMemo(() => {
      const traverses = measurements.filter(isTraverseMeasurementEntry);
      const currentIds = new Set(traverses.map((m) => m.id));
      return [traverses, currentIds];
    }, [measurements]);

  // Use overlay labels instead of Cesium entity labels
  useAnnotationOverlayTraverse(traverses, showLabels, referenceElevation);

  // Preview lines are now handled by DOM-based overlay system
  // TODO: Implement simplified preview line using ConnectingLine component

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
          /^(point-marker|point-label|point-number|segment|polyline|vertical-line)-(traverse-\d+)/
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
    renderedTraversesRef.current.forEach((renderInfo, traverseId) => {
      if (!currentIds.has(traverseId)) {
        renderedTraversesRef.current.delete(traverseId);
      }
    });

    if (!showTraverse) {
      clearVisualizations();
      renderedTraversesRef.current.clear();
      return;
    }

    // Remove all Cesium label entities when showCesiumLabels is false
    if (!showCesiumLabels) {
      const labelEntitiesToRemove = traverseEntiesRef.current.filter(
        (entity) => {
          return (
            entity.id?.includes("label") ||
            entity.id?.includes("segment") ||
            entity.id?.includes("number")
          );
        }
      );

      labelEntitiesToRemove.forEach((entity) => {
        try {
          viewer.entities.remove(entity);
        } catch {}
        const index = traverseEntiesRef.current.indexOf(entity);
        if (index > -1) {
          traverseEntiesRef.current.splice(index, 1);
        }
      });
    }

    // Only render new or updated traverses
    traverses.forEach((traverse) => {
      const lastRenderedInfo = renderedTraversesRef.current.get(traverse.id);

      // Skip if this traverse is already fully rendered and hasn't changed
      if (
        lastRenderedInfo &&
        lastRenderedInfo.timestamp >= traverse.timestamp &&
        lastRenderedInfo.referenceElevation === referenceElevation
      ) {
        return;
      }

      // Remove existing entities for this traverse before re-rendering (only if it needs updating)
      if (lastRenderedInfo) {
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
        const stemLineId = `vertical-line-${traverse.id}-${index}`;

        const pointGeographic = traverse.geometryWGS84[index];

        // Get heightOffset from measurement data, default to 0 if not set
        const heightOffset = traverse.heightOffset || 0;

        // Create elevated point for visualization if heightOffset > 0
        const visualizationPoint =
          heightOffset > 0 ? getLocalElevatedPoint(point, heightOffset) : point;

        if (!viewer.entities.getById(pointMarkerId)) {
          const pointMarker = createPointMarker(
            visualizationPoint,
            pointMarkerId,
            showCesiumLabels ? 11 : 4
          );
          viewer.entities.add(pointMarker);
          traverseEntiesRef.current.push(pointMarker);
        }

        // Add vertical line from ground to elevated point if heightOffset > 0
        if (
          heightOffset > STEMLINE_MIN_OFFSET &&
          !viewer.entities.getById(stemLineId) &&
          showCesiumLabels
        ) {
          const stemLine = new Entity({
            id: stemLineId,
            polyline: {
              positions: [point, visualizationPoint],
              width: config.stemLineWidth,
              material: config.stemLineMaterial,
              clampToGround: false,
            },
          });
          viewer.entities.add(stemLine);
          traverseEntiesRef.current.push(stemLine);
        }
        // Only create Cesium entity labels if showCesiumLabels is true and derived data is available
        if (showCesiumLabels && traverse.derived) {
          const existingLabel = viewer.entities.getById(pointLabelId);
          if (!existingLabel) {
            const cumulativeLength =
              traverse.derived.segmentLengthsCumulative[index] || 0;
            const isSingleSegment = traverse.geometryECEF.length === 2;

            // Create distance label (offset from point)
            const pointLabel = createSegmentNodeLabel(
              visualizationPoint,
              pointGeographic,
              index,
              cumulativeLength,
              pointLabelId,
              isSingleSegment,
              referenceElevation
            );
            viewer.entities.add(pointLabel);
            traverseEntiesRef.current.push(pointLabel);
          } else {
            // Update existing label text with new reference elevation
            const cumulativeLength =
              traverse.derived.segmentLengthsCumulative[index] || 0;
            const isSingleSegment = traverse.geometryECEF.length === 2;

            const pointLabelText = createPointLabelText(
              pointGeographic,
              index,
              cumulativeLength,
              isSingleSegment,
              referenceElevation
            );

            if (existingLabel.label && existingLabel.label.text) {
              (existingLabel.label.text as ConstantProperty).setValue(
                pointLabelText
              );
            }
          }
        }

        // Create number label directly on the point (only for Cesium entity labels)
        if (showCesiumLabels) {
          const pointNumberId = `point-number-${traverse.id}-${index}`;
          if (!viewer.entities.getById(pointNumberId)) {
            const numberLabel = createNodeNumberLabel(
              visualizationPoint,
              index,
              pointNumberId
            );
            viewer.entities.add(numberLabel);
            traverseEntiesRef.current.push(numberLabel);
          }
        }
      });

      // Segment labels (only for Cesium entity labels)
      if (showCesiumLabels) {
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
            width: config.lineWidth,
            material: config.lineMaterial,
            clampToGround: false,
          },
        });
        viewer.entities.add(polylineEntity);
        traverseEntiesRef.current.push(polylineEntity);
      }

      // Mark this traverse as fully rendered
      renderedTraversesRef.current.set(traverse.id, {
        timestamp: traverse.timestamp,
        referenceElevation,
      });
    });

    prevIdsRef.current = currentIds;
    requestRender();
    // configs are static,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewer,
    traverses,
    currentIds,
    showTraverse,
    showLabels,
    showCesiumLabels,
    clearVisualizations,
    requestRender,
    referenceElevation,
  ]);

  // Preview lines are now handled by DOM-based overlay system
  // No Cesium entity-based preview logic needed

  // Handle camera drag/zoom end events to update label visibility
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    const handleCameraChange = () => {
      traverses.forEach((traverse) => {
        const traverseEntities = traverseEntiesRef.current.filter((entity) => {
          return entity.id?.includes(traverse.id);
        });

        if (traverseEntities.length > 0) {
          if (showCesiumLabels) {
            updateTraverseLabelVisibility(viewer, traverseEntities, traverse);
          } else {
            // Hide all Cesium entity labels when showCesiumLabels is false
            traverseEntities.forEach((entity) => {
              if (
                entity.id?.includes("label") ||
                entity.id?.includes("segment") ||
                entity.id?.includes("number")
              ) {
                entity.show = false;
              }
            });
          }
        }
      });
      requestRender();
    };

    // Add camera event listeners - only on end events for better performance
    console.log("[TraverseVisualizer] Registering moveEnd listener");
    const removeMoveEndListener =
      viewer.camera.moveEnd.addEventListener(handleCameraChange);

    // Initial label visibility update
    handleCameraChange();

    return () => {
      console.log("[TraverseVisualizer] Removing moveEnd listener");
      removeMoveEndListener();
    };
  }, [viewer, traverses, showCesiumLabels, requestRender]);

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
