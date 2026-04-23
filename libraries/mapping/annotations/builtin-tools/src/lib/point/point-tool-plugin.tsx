import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  formatMeasurementShortLabelToken,
  isKeyboardTargetEditable,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "@carma-mapping/annotations/runtime";
import {
  createMeasurementToolPlugin,
  KEYBOARD_MEASUREMENT_PLUGIN_CAPABILITIES,
  measurementVisualStyles,
  withPointMarkerVisualStyle,
} from "@carma-mapping/annotations/runtime";
import {
  addPointMeasurement,
  commitPointMeasurementDraft,
  removeLatestPointMeasurement,
  trimLatestPointMeasurementDraft,
} from "./point-tool-actions";
import { createPointToolInfoBoxSlots } from "./point-tool-info-box-slots";
import { buildPointToolRenderModels } from "./point-tool-render-models";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "@carma-mapping/annotations/runtime";
import type { AnnotationToolDraftState } from "@carma-mapping/annotations/runtime";
const { POINT: ANNOTATION_TYPE_POINT } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_POINT;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const pointToolVisuals = {
  point: withPointMarkerVisualStyle(measurementVisualStyles.point),
};
const getPointToolInfoBoxSlots = createPointToolInfoBoxSlots(toolType, {
  headingTitle: "Punktmessung",
  headingColor: labelTheme.scheme.colorPrimary,
  formatMeasurementLabelToken: (counter) =>
    formatMeasurementShortLabelToken(toolType, counter),
});

export const pointToolPlugin = createMeasurementToolPlugin({
  id: toolType,
  annotationType: toolType,
  descriptor: {
    id: toolType,
    order: 20,
    label: "Punktmessung",
    tooltip: "Punkt messen",
    shortcutKey: "M",
    icon: <FontAwesomeIcon icon={faLocationDot} />,
  },
  helpText: [
    "Klick auf eine Position in der Karte setzt dort eine Punktmessung.",
    "Jeder weitere Klick erstellt sofort eine neue Punktmessung.",
  ],
  capabilities: [
    ...KEYBOARD_MEASUREMENT_PLUGIN_CAPABILITIES,
    ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX,
  ],
  session: {
    createSession: ({ setActiveToolType, drafts, addAnnotation }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => {
        const draft = drafts.get(toolType);
        if (draft.coordinates.length === 0) {
          return false;
        }

        const committedMeasurements = commitPointMeasurementDraft(
          toolType,
          draft,
          { addAnnotation },
          toolType
        );
        drafts.clear(toolType);
        return committedMeasurements.length > 0;
      },
      discardDraft: () => {
        drafts.clear(toolType);
      },
    }),
  },
  pointQuery: {
    onPointCreated: ({ coordinate, linkedNodeGroupId, sessionContext }) => {
      const temporaryMode =
        sessionContext.getState().settingsState.pointTemporaryMode;
      if (temporaryMode) {
        const currentDraft = sessionContext.drafts.get(toolType);
        sessionContext.drafts.set(toolType, {
          coordinates: [...currentDraft.coordinates, coordinate],
          linkedNodeGroupIds: [
            ...currentDraft.linkedNodeGroupIds,
            linkedNodeGroupId ?? null,
          ],
        } satisfies AnnotationToolDraftState);
        return;
      }

      addPointMeasurement(
        toolType,
        coordinate,
        linkedNodeGroupId,
        {
          addAnnotation: sessionContext.addAnnotation,
        },
        toolType
      );
    },
  },
  keyboard: {
    onKeyDown: ({ event, sessionContext }) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isKeyboardTargetEditable(event.target)
      ) {
        return false;
      }

      if (event.key !== "Backspace") {
        return false;
      }

      const currentDraft = sessionContext.drafts.get(toolType);
      if (currentDraft.coordinates.length > 0) {
        sessionContext.drafts.set(
          toolType,
          trimLatestPointMeasurementDraft(currentDraft)
        );
        event.preventDefault();
        return true;
      }

      const removed = removeLatestPointMeasurement(toolType, {
        state: sessionContext.getState(),
        dispatch: sessionContext.dispatch,
      });
      if (!removed) {
        return false;
      }

      event.preventDefault();
      return true;
    },
  },
  visualModels: {
    build: ({
      nodes,
      annotationEntries,
      draftStatesByToolType,
      elevationReferenceAnnotationId,
      selectedAnnotationIds,
      isSelectionAdditiveModifierPressed,
      setSelectedAnnotationId,
      setElevationReferenceAnnotationId,
      toggleAnnotationElevationDisplayMode,
      onNodeLongPress,
      formatOptions,
    }) => {
      const { points, pointLabels } = buildPointToolRenderModels({
        toolType,
        visuals: pointToolVisuals,
        labelTheme,
        formatOptions,
        getMeasurementLabel: (counter) =>
          formatMeasurementShortLabelToken(toolType, counter),
        nodes,
        measurements: annotationEntries,
        draft: draftStatesByToolType[toolType],
        elevationReferenceAnnotationId,
        selectedMeasurementIds: selectedAnnotationIds,
        isSelectionAdditiveModifierPressed,
        onMeasurementSelect: setSelectedAnnotationId,
        onMeasurementLabelClick: toggleAnnotationElevationDisplayMode,
        onMeasurementLabelDoubleClick: setElevationReferenceAnnotationId,
        onNodeLongPress,
      });

      return {
        points,
        edges: [],
        pointLabels,
      };
    },
  },
  infoBox: {
    getSlots: getPointToolInfoBoxSlots,
  },
});
