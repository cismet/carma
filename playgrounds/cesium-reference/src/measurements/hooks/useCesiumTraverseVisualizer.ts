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
import { formatDistance } from "../../utils/formatters";
import {
  createSegmentLabel,
  createSegmentNodeLabel,
  createNodeNumberLabel,
  updateTraverseLabelVisibility,
  createPointLabelText,
} from "../utils/cesiumLabels";
import { useRequestRender } from "./useRequestRender";

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
  lineWidth: 2,
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

enum PREVIEW_NAMES {
  LABEL = "__previewLabel",
  LINE = "__previewLine",
  STEM = "__previewStem",
}

const previewNameValues = Object.freeze(Object.values(PREVIEW_NAMES));

const isPreviewName = (name: string): name is PREVIEW_NAMES => {
  return previewNameValues.includes(name as PREVIEW_NAMES);
};

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
  currentTraverseId: string | null = null,
  referenceElevation: number = 0
) {
  const traverseEntiesRef = useRef<Entity[]>([]);
  const currentPolylineRef = useRef<Entity | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const renderedTraversesRef = useRef<
    Map<string, { timestamp: number; referenceElevation: number }>
  >(new Map());
  const requestRender = useRequestRender(viewer);

  const config = defaultTraverseStyleConfig;

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
            pointMarkerId
          );
          viewer.entities.add(pointMarker);
          traverseEntiesRef.current.push(pointMarker);
        }

        // Add vertical line from ground to elevated point if heightOffset > 0
        if (
          heightOffset > STEMLINE_MIN_OFFSET &&
          !viewer.entities.getById(stemLineId)
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

        // Create number label directly on the point
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
    clearVisualizations,
    requestRender,
    referenceElevation,
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
      const previewEntities = traverseEntiesRef.current.filter((entity) =>
        isPreviewName(entity.name)
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
      (entity) => entity.name === PREVIEW_NAMES.LABEL
    );

    if (!previewLabel) {
      previewLabel = createSegmentLabel(
        elevatedLastPoint,
        elevatedMousePosition,
        segmentDistance
      );
      previewLabel.name = PREVIEW_NAMES.LABEL;
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
      (entity) => entity.name === PREVIEW_NAMES.LINE
    );

    if (!previewLine) {
      previewLine = new Entity({
        name: PREVIEW_NAMES.LINE,
        polyline: {
          positions: new ConstantProperty([
            elevatedLastPoint,
            elevatedMousePosition,
          ]),
          width: config.previewLineWidth,
          material: config.previewLineMaterial,
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

    // Add preview stem line for mouse position if heightOffset > min height
    let previewStem = traverseEntiesRef.current.find(
      (entity) => entity.name === PREVIEW_NAMES.STEM
    );

    if (heightOffset > STEMLINE_MIN_OFFSET) {
      if (!previewStem) {
        previewStem = new Entity({
          name: PREVIEW_NAMES.STEM,
          polyline: {
            positions: new ConstantProperty([
              mousePosition,
              elevatedMousePosition,
            ]),
            width: config.stemLineWidth,
            material: config.stemLineMaterial,
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
    // config properties are static constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const removeMoveEndListener =
      viewer.camera.moveEnd.addEventListener(handleCameraChange);

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
