import { VectorPolylineIcon } from "@carma-commons/ui/components";
import {
  ANNOTATION_TYPE_POLYLINE,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  isKeyboardTargetEditable,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  createMeasurementToolPlugin,
  NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import {
  clearDraftCoordinatesByToolType,
  getDraftCoordinatesForTool,
  setDraftCoordinatesByToolType,
} from "../../store";
import { createSegmentToolPreviewController } from "../../interaction/createSegmentToolPreviewController";
import {
  appendPolylinePreviewPoint,
  finishPolylinePreview,
} from "./polylineToolActions";
import { resolvePolylineToolKeyAction } from "./polylineToolBindings";
import { buildPolylineToolRenderModels } from "./polylineToolRenderModels";
import { createPolylineToolSettings } from "./polylineToolSettings";
const toolType = ANNOTATION_TYPE_POLYLINE;
const badgeStyle = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType];
const polylineToolSettings = createPolylineToolSettings(badgeStyle);

export const polylineToolPlugin = createMeasurementToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 40,
    label: "Polygonzug",
    tooltip: "Polygonzug messen",
    icon: <VectorPolylineIcon fontSize="1.33em" />,
  },
  helpText: [
    "Punkte nacheinander setzen, um einen Polygonzug zu erstellen.",
    "Doppelklick schliesst die Messung ab, Escape verwirft den Entwurf.",
  ],
  capabilities: NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
  session: {
    createSession: ({
      dispatch,
      getState,
      setActiveToolType,
      addAnnotation,
    }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => {
        const nextMeasurement = finishPolylinePreview({
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
            coordinates: appendPolylinePreviewPoint(
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
      if (activeToolSession?.onNodeCreated) {
        activeToolSession.onNodeCreated(coordinate);
        return;
      }

      // eslint-disable-next-line no-console
      console.info(
        `[annotations-runtime] polyline pointQuery invoked without an active onNodeCreated session handler.`
      );
    },
  },
  preview: {
    createController: (context) =>
      createSegmentToolPreviewController({
        toolType,
        context,
        showCommittedDraftChain: true,
      }),
  },
  keyboard: {
    onKeyDown: ({ event, activeToolSession }) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isKeyboardTargetEditable(event.target)
      ) {
        return false;
      }

      const action = resolvePolylineToolKeyAction(event);
      if (!action) {
        return false;
      }

      if (action === "cancelPreview") {
        activeToolSession?.discardDraft();
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
    }) => {
      const { points, edges, pointLabels } = buildPolylineToolRenderModels({
        toolType,
        visuals: polylineToolSettings.visuals,
        badgeStyle,
        getMeasurementLabel: (counter) =>
          formatMeasurementShortLabelToken(toolType, counter),
        nodes,
        measurements: annotationEntries,
        selectedMeasurementId: selectedAnnotationId,
        onMeasurementSelect: setSelectedAnnotationId,
        onNodeLongPress,
      });

      return {
        points,
        edges,
        pointLabels,
      };
    },
  },
});
