import { VectorSquareIcon } from "@carma-commons/ui/components";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import { createPolygonToolPreviewController } from "../../interaction/createPolygonToolPreviewController";
import {
  clearDraftCoordinatesByToolType,
  getDraftCoordinatesForTool,
  setDraftCoordinatesByToolType,
} from "../../store";
import {
  createMeasurementToolPlugin,
  NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import {
  appendAreaPreviewPoint,
  commitAreaMeasurement,
  undoAreaPreviewPoint,
} from "../area-shared/nodeChainAreaToolActions";
import { resolveNodeChainAreaToolKeyAction } from "../area-shared/nodeChainAreaToolBindings";
import { createNodeChainAreaToolInfoBoxSlots } from "../area-shared/nodeChainAreaToolInfoBoxSlots";
import { buildNodeChainAreaToolRenderModels } from "../area-shared/nodeChainAreaToolRenderModels";
import { createNodeChainAreaToolSettings } from "../area-shared/nodeChainAreaToolSettings";

const toolType = ANNOTATION_TYPE_AREA_GROUND;
const badgeStyle = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType];
const areaGroundToolSettings = createNodeChainAreaToolSettings({
  badgeStyle,
  fill: "rgba(107, 188, 123, 0.25)",
  selectedFill: "rgba(107, 188, 123, 0.35)",
});
const getAreaGroundToolInfoBoxSlots = createNodeChainAreaToolInfoBoxSlots(
  toolType,
  {
    headingTitle: "Grundriss",
    formatMeasurementLabelToken: (counter) =>
      formatMeasurementShortLabelToken(toolType, counter),
  }
);

export const areaGroundToolPlugin = createMeasurementToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 45,
    label: "Grundriss",
    tooltip: "Grundriss messen",
    icon: <VectorSquareIcon fontSize="1.33em" />,
  },
  helpText: [
    "Punkte nacheinander setzen, um einen Grundriss zu erstellen.",
    "Doppelklick schliesst die Fläche ab, Escape verwirft den Entwurf.",
  ],
  capabilities: [...NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES, "infoBox"],
  session: {
    createSession: ({ dispatch, getState, setActiveToolType, addAnnotation }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => {
        const nextMeasurement = commitAreaMeasurement({
          toolType,
          coordinates: getDraftCoordinatesForTool(getState().draftState, toolType),
          addAnnotation,
        });

        dispatch(clearDraftCoordinatesByToolType(toolType));
        return Boolean(nextMeasurement);
      },
      discardDraft: () => {
        dispatch(clearDraftCoordinatesByToolType(toolType));
      },
      onNodeCreated: (coordinate) => {
        dispatch(
          setDraftCoordinatesByToolType({
            toolType,
            coordinates: appendAreaPreviewPoint(
              getDraftCoordinatesForTool(getState().draftState, toolType),
              coordinate
            ),
          })
        );
      },
      finishesOnLoopClosure: true,
    }),
  },
  pointQuery: {
    onPointCreated: ({ coordinate, activeToolSession }) => {
      activeToolSession?.onNodeCreated?.(coordinate);
    },
  },
  preview: {
    createController: (context) =>
      createPolygonToolPreviewController({
        toolType,
        context,
      }),
  },
  keyboard: {
    onKeyDown: ({ event, activeToolSession, sessionContext }) => {
      const action = resolveNodeChainAreaToolKeyAction(event);
      if (!action) {
        return false;
      }

      if (action === "cancelPreview") {
        activeToolSession?.discardDraft();
        event.preventDefault();
        return true;
      }

      if (action === "undoLastPoint") {
        sessionContext.dispatch(
          setDraftCoordinatesByToolType({
            toolType,
            coordinates: undoAreaPreviewPoint(
              getDraftCoordinatesForTool(
                sessionContext.getState().draftState,
                toolType
              )
            ),
          })
        );
        event.preventDefault();
        return true;
      }

      return false;
    },
  },
  renderLayer: {
    build: ({
      nodes,
      annotationEntries,
      selectedAnnotationId,
      setSelectedAnnotationId,
      onNodeLongPress,
    }) =>
      buildNodeChainAreaToolRenderModels({
        toolType,
        visuals: areaGroundToolSettings.visuals,
        badgeStyle,
        getMeasurementLabel: (counter) =>
          formatMeasurementShortLabelToken(toolType, counter),
        nodes,
        measurements: annotationEntries,
        selectedMeasurementId: selectedAnnotationId,
        fillPlacement: "ground",
        onMeasurementSelect: setSelectedAnnotationId,
        onNodeLongPress,
      }),
  },
  infoBox: {
    getSlots: getAreaGroundToolInfoBoxSlots,
  },
});
