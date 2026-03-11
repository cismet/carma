import { useMemo } from "react";

import type { PolygonPolylineAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getNodeChainAnnotationSlotsInput } from "./getNodeChainAnnotationSlotsInput";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";
import {
  useAnnotationCollection,
  useNodeChainAnnotationReadModel,
  useAnnotationSettings,
} from "../../context/AnnotationsProvider";

export type NodeChainInfoBoxSlotsInputState = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
};

export const useNodeChainInfoBoxSlotsInput =
  (): NodeChainInfoBoxSlotsInputState => {
    const annotations = useAnnotationCollection();
    const settings = useAnnotationSettings();
    const nodeChainReadModel = useNodeChainAnnotationReadModel();
    const actions = useAnnotationInfoBoxSlotActions();

    const slotsInput = useMemo(
      () =>
        getNodeChainAnnotationSlotsInput({
          polylineMeasurements: nodeChainReadModel.polylineMeasurements,
          groundPolygons: nodeChainReadModel.groundPolygons,
          planarPolygons: nodeChainReadModel.planarPolygons,
          verticalPolygons: nodeChainReadModel.verticalPolygons,
          polylinePaths: nodeChainReadModel.polylinePaths,
          annotations: annotations.items,
          fallbackPolylineSegmentLineMode: settings.polyline.segmentLineMode,
          focusedNodeChainAnnotationId: nodeChainReadModel.focusedMeasurementId,
          activeNodeChainAnnotationId: nodeChainReadModel.activeMeasurementId,
          actions,
        }).slotsInput,
      [
        actions,
        annotations.items,
        nodeChainReadModel.activeMeasurementId,
        nodeChainReadModel.focusedMeasurementId,
        settings.polyline.segmentLineMode,
        nodeChainReadModel.groundPolygons,
        nodeChainReadModel.planarPolygons,
        nodeChainReadModel.polylineMeasurements,
        nodeChainReadModel.polylinePaths,
        nodeChainReadModel.verticalPolygons,
      ]
    );

    return {
      slotsInput,
    };
  };
