import type {
  AnnotationNode,
  StoredAnnotation,
} from "../../store/annotations-store.types";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "../../render/measurement-render-models";
import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolve-measurement-coordinates";
import type { PolylineToolVisualSettings } from "./polyline-tool-settings";
import { formatLengthMeters } from "@carma-units";
import {
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
} from "../../config/measurement-visual-defaults";
import {
  computePolylineTotalLengthMeters,
} from "../../derived/measurement-summaries";

type BuildPolylineToolRenderModelsArgs = {
  toolType: StoredAnnotation["toolType"];
  visuals: PolylineToolVisualSettings;
  formatOptions: AnnotationsRuntimeFormatOptions;
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly AnnotationNode[];
  measurements: readonly StoredAnnotation[];
  selectedMeasurementIds: readonly string[];
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
};

export const buildPolylineToolRenderModels = ({
  toolType,
  visuals,
  formatOptions,
  badgeStyle,
  getMeasurementLabel,
  nodes,
  measurements,
  selectedMeasurementIds,
  onMeasurementSelect,
  onNodeLongPress,
}: BuildPolylineToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const committedPolylines = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );
  const visiblePolylines = committedPolylines.filter(
    (measurement) => !measurement.hidden
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);

  const committedEdges = visiblePolylines.flatMap((measurement) => {
    const coordinates = resolveMeasurementCoordinates(
      measurement,
      nodeCoordinatesById
    );

    if (coordinates.length < 2) {
      return [];
    }

    return [
      {
        id: measurement.id,
        measurementId: measurement.id,
        nodeIds: measurement.nodeIds,
        coordinates,
        showSegmentLengthLabels: true as const,
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? applySelectedEdgeVisualStyle(visuals.edge)
          : visuals.edge),
      },
    ];
  });

  const committedPoints = visiblePolylines.flatMap((measurement) =>
    measurement.nodeIds.flatMap((nodeId, index) => {
      const coordinate = nodeCoordinatesById.get(nodeId);
      if (!coordinate) {
        return [];
      }

      return [
        {
          id: `${measurement.id}-node-${index}`,
          measurementId: measurement.id,
          nodeId,
          coordinate,
          onClick: onMeasurementSelect
            ? () => onMeasurementSelect(measurement.id)
            : undefined,
          ...(selectedMeasurementIdSet.has(measurement.id)
            ? applySelectedPointMarkerVisualStyle(visuals.point)
            : visuals.point),
        },
      ];
    })
  );

  const committedPointLabels = visiblePolylines.flatMap(
    (measurement, measurementIndex) => {
      const badgeText =
        measurement.shortLabel?.trim() ||
        getMeasurementLabel(measurementIndex + 1);
      const lastNodeIndex = measurement.nodeIds.length - 1;
      const lastNodeId =
        lastNodeIndex >= 0 ? measurement.nodeIds[lastNodeIndex] : undefined;
      const coordinate = lastNodeId
        ? nodeCoordinatesById.get(lastNodeId)
        : undefined;
      if (!coordinate || !lastNodeId) {
        return [];
      }

      const pointVisuals = selectedMeasurementIdSet.has(measurement.id)
        ? applySelectedPointMarkerVisualStyle(visuals.point)
        : visuals.point;
      const totalLengthText = formatLengthMeters(
        computePolylineTotalLengthMeters(
          resolveMeasurementCoordinates(measurement, nodeCoordinatesById)
        ),
        formatOptions.lengthMeters
      );

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: lastNodeId,
          pointMarkerId: `${measurement.id}-node-${lastNodeIndex}`,
          coordinate,
          markerPixelSize: pointVisuals.pixelSize,
          markerOutlineWidth: pointVisuals.outlineWidth,
          content: `${badgeText} ${totalLengthText}`,
          badgeContent: badgeText,
          markerBackgroundColor: badgeStyle.backgroundColor,
          markerTextColor: badgeStyle.textColor,
          selected: selectedMeasurementIdSet.has(measurement.id),
          onClick: onMeasurementSelect
            ? () => onMeasurementSelect(measurement.id)
            : undefined,
          onLongPress:
            onNodeLongPress && !measurement.locked
              ? () => onNodeLongPress(lastNodeId, measurement.id)
              : undefined,
        },
      ];
    }
  );

  return {
    points: committedPoints,
    edges: committedEdges,
    pointLabels: committedPointLabels,
  };
};
