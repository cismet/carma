import type { AnnotationsRuntimeFormatOptions } from "../../config/annotationsRuntimeFormatOptions";
import type {
  RuntimeMeasurement,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "../../render/measurementRenderModels";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolveMeasurementCoordinates";
import {
  formatPointElevationLabelText,
  resolvePointElevationDisplayMode,
  resolvePointElevationReferenceCoordinate,
} from "./pointToolElevationDisplay";
import type { PointToolVisualSettings } from "./pointToolSettings";

type BuildPointToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: PointToolVisualSettings;
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
  formatOptions: AnnotationsRuntimeFormatOptions;
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  elevationReferenceAnnotationId: string | null;
  selectedMeasurementIds: readonly string[];
  onMeasurementSelect: (measurementId: string) => void;
  onMeasurementLabelClick: (measurementId: string) => void;
  onMeasurementLabelDoubleClick: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
};

export const buildPointToolRenderModels = ({
  toolType,
  visuals,
  badgeStyle,
  formatOptions,
  getMeasurementLabel,
  nodes,
  measurements,
  elevationReferenceAnnotationId,
  selectedMeasurementIds,
  onMeasurementSelect,
  onMeasurementLabelClick,
  onMeasurementLabelDoubleClick,
  onNodeLongPress,
}: BuildPointToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const pointMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);
  const referenceCoordinate = resolvePointElevationReferenceCoordinate({
    annotationEntries: pointMeasurements,
    nodes,
    configuredReferenceAnnotationId: elevationReferenceAnnotationId,
  });

  return {
    points: pointMeasurements.flatMap((measurement) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;

      if (!coordinate) {
        return [];
      }

      return [
        {
          id: measurement.id,
          coordinate,
          ...(selectedMeasurementIdSet.has(measurement.id)
            ? visuals.selectedPoint
            : visuals.point),
        },
      ];
    }),
    pointLabels: pointMeasurements.flatMap((measurement, pointIndex) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;

      if (!coordinate) {
        return [];
      }
      const pointNodeId = measurement.nodeIds[0] ?? null;
      const pointVisuals = selectedMeasurementIdSet.has(measurement.id)
        ? visuals.selectedPoint
        : visuals.point;

      const badgeText =
        measurement.shortLabel?.trim() || getMeasurementLabel(pointIndex + 1);
      const elevationText = formatPointElevationLabelText({
        coordinate,
        referenceCoordinate,
        elevationDisplayMode: resolvePointElevationDisplayMode(measurement),
        formatOptions,
      });

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: pointNodeId ?? undefined,
          pointMarkerId: measurement.id,
          coordinate,
          markerPixelSize: pointVisuals.pixelSize,
          content: elevationText,
          badgeContent: badgeText,
          markerBackgroundColor: badgeStyle.backgroundColor,
          markerTextColor: badgeStyle.textColor,
          selected: selectedMeasurementIdSet.has(measurement.id),
          onClick: () => {
            onMeasurementLabelClick(measurement.id);
            onMeasurementSelect(measurement.id);
          },
          onDoubleClick: () => {
            onMeasurementLabelDoubleClick(measurement.id);
            onMeasurementSelect(measurement.id);
          },
          onLongPress:
            onNodeLongPress && pointNodeId
              ? () => onNodeLongPress(pointNodeId, measurement.id)
              : undefined,
        },
      ];
    }),
  };
};
