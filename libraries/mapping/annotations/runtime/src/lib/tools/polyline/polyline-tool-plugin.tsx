import { VectorPolylineIcon } from "@carma-commons/ui/components";
import {
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  isKeyboardTargetEditable,
  type AnnotationToolType,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
} from "../plugin-factories";
import type { AnnotationToolDraftState } from "../annotation-tool-plugin.types";
import { createSegmentAuthoringController } from "../../interaction/create-segment-authoring-controller";
import {
  appendPolylinePreviewPoint,
  finishPolylinePreview,
} from "./polyline-tool-actions";
import { resolvePolylineToolKeyAction } from "./polyline-tool-bindings";
import { buildPolylineToolRenderModels } from "./polyline-tool-render-models";
import { createPolylineToolSettings } from "./polyline-tool-settings";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "../../config/annotation-measurement-label-themes";
const { POLYLINE: ANNOTATION_TYPE_POLYLINE } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_POLYLINE;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const badgeStyle = {
  ...DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType],
  backgroundColor: labelTheme.scheme.colorPrimary,
  textColor: labelTheme.scheme.textColor,
};
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
  capabilities: AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  session: {
    createSession: ({ drafts, setActiveToolType, addAnnotation }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => {
        const draft = drafts.get(toolType);
        const nextMeasurement = finishPolylinePreview({
          toolType,
          coordinates: draft.coordinates,
          linkedNodeGroupIds: draft.linkedNodeGroupIds,
          addAnnotation,
        });

        drafts.clear(toolType);
        return Boolean(nextMeasurement);
      },
      discardDraft: () => {
        drafts.clear(toolType);
      },
      onNodeCreated: (coordinate, linkedNodeGroupId) => {
        const currentDraft = drafts.get(toolType);
        const nextDraft: AnnotationToolDraftState = {
          coordinates: appendPolylinePreviewPoint(
            currentDraft.coordinates,
            coordinate
          ),
          linkedNodeGroupIds: appendPolylinePreviewPoint(
            currentDraft.linkedNodeGroupIds,
            linkedNodeGroupId ?? null
          ),
        };
        drafts.set(toolType, nextDraft);
      },
      finishesOnLoopClosure: true,
    }),
  },
  pointQuery: {
    onPointCreated: ({ coordinate, linkedNodeGroupId, activeToolSession }) => {
      if (activeToolSession?.onNodeCreated) {
        activeToolSession.onNodeCreated(coordinate, linkedNodeGroupId);
        return;
      }

      // eslint-disable-next-line no-console
      console.info(
        `[annotations-runtime] polyline pointQuery invoked without an active onNodeCreated session handler.`
      );
    },
  },
  authoringVisuals: {
    createController: (context) =>
      createSegmentAuthoringController({
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
  visualModels: {
    build: ({
      nodes,
      annotationEntries,
      selectedAnnotationIds,
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
        selectedMeasurementIds: selectedAnnotationIds,
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
