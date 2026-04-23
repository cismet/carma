import { VectorPolylineIcon } from "@carma-commons/ui/components";
import {
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  formatMeasurementShortLabelToken,
  isKeyboardTargetEditable,
  resolveAnnotationCommonShortcutAction,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
  measurementVisualStyles,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "@carma-mapping/annotations/runtime";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "@carma-mapping/annotations/runtime";
import type { AnnotationToolDraftState } from "@carma-mapping/annotations/runtime";
import { createSegmentAuthoringController } from "@carma-mapping/annotations/runtime";
import {
  appendPolylinePreviewPoint,
  finishPolylinePreview,
} from "./polyline-tool-actions";
import { createPolylineToolInfoBoxSlots } from "./polyline-tool-info-box-slots";
import { buildPolylineToolRenderModels } from "./polyline-tool-render-models";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "@carma-mapping/annotations/runtime";
const { POLYLINE: ANNOTATION_TYPE_POLYLINE } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_POLYLINE;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const badgeStyle = {
  ...DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType],
  backgroundColor: labelTheme.scheme.colorPrimary,
  textColor: labelTheme.scheme.textColor,
};
const polylineToolVisuals = {
  edge: withEdgeVisualStyle(measurementVisualStyles.edge),
  point: withPointMarkerVisualStyle(measurementVisualStyles.point),
};
const getPolylineToolInfoBoxSlots = createPolylineToolInfoBoxSlots(toolType, {
  headingTitle: "Polygonzug",
  headingColor: labelTheme.scheme.colorPrimary,
  formatMeasurementLabelToken: (counter) =>
    formatMeasurementShortLabelToken(toolType, counter),
});

export const polylineToolPlugin = createMeasurementToolPlugin({
  id: toolType,
  annotationType: toolType,
  descriptor: {
    id: toolType,
    order: 40,
    label: "Polygonzug",
    tooltip: "Polygonzug messen",
    shortcutKey: "P",
    icon: <VectorPolylineIcon fontSize="1.33em" />,
  },
  helpText: [
    "Punkte nacheinander setzen, um einen Polygonzug zu erstellen.",
    "Doppelklick schliesst die Messung ab, Escape verwirft den Entwurf.",
  ],
  capabilities: [
    ...AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
    ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX,
  ],
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
          sourceToolId: toolType,
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

      if (
        resolveAnnotationCommonShortcutAction(event) !==
        ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL
      ) {
        return false;
      }

      activeToolSession?.discardDraft();
      event.preventDefault();
      return true;
    },
  },
  visualModels: {
    build: ({
      nodes,
      annotationEntries,
      selectedAnnotationIds,
      setSelectedAnnotationId,
      formatOptions,
      onNodeLongPress,
    }) => {
      const { points, edges, pointLabels } = buildPolylineToolRenderModels({
        toolType,
        visuals: polylineToolVisuals,
        formatOptions,
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
  infoBox: {
    getSlots: getPolylineToolInfoBoxSlots,
  },
});
