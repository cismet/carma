import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  formatMeasurementShortLabelToken,
  type AnnotationToolType,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "../annotation-tool-plugin.types";
import {
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
} from "../plugin-factories";
import type { AnnotationToolDraftState } from "../annotation-tool-plugin.types";
import {
  appendDistancePreviewPoint,
  commitDistanceMeasurement,
  undoDistancePreviewPoint,
} from "./distance-tool-actions";
import { resolveDistanceToolKeyAction } from "./distance-tool-bindings";
import { resolveDistanceToolAddAnnotationOptions } from "./resolve-distance-tool-add-annotation-options";
import { createDistanceToolInfoBoxSlots } from "./distance-tool-info-box-slots";
import { createDistanceAuthoringController } from "./create-distance-authoring-controller";
import { buildDistanceToolRenderModels } from "./distance-tool-render-models";
import { createDistanceToolSettings } from "./distance-tool-settings";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "../../config/annotation-measurement-label-themes";
const { DISTANCE: ANNOTATION_TYPE_DISTANCE } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_DISTANCE;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const badgeStyle = {
  backgroundColor: labelTheme.scheme.colorPrimary,
  textColor: labelTheme.scheme.textColor,
  selectionColor: labelTheme.selection.glowColor,
};
const distanceToolSettings = createDistanceToolSettings(badgeStyle);
const getDistanceToolInfoBoxSlots = createDistanceToolInfoBoxSlots(toolType, {
  headingTitle: "Distanzmessung",
  headingColor: labelTheme.scheme.colorPrimary,
  formatMeasurementLabelToken: (counter) =>
    formatMeasurementShortLabelToken(toolType, counter),
});

export const distanceToolPlugin = createMeasurementToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 30,
    label: "Distanzmessung",
    tooltip: "Distanz messen",
    icon: <FontAwesomeIcon icon={faRuler} />,
  },
  helpText: [
    "Zwei Positionen in der Karte anklicken, um eine Distanzmessung zu erstellen.",
    "Backspace entfernt den letzten Vorschaupunkt, Escape verwirft ihn.",
  ],
  capabilities: [
    ...AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
    ANNOTATION_TOOL_PLUGIN_CAPABILITIES.ADD_ANNOTATION,
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
        const nextMeasurement = commitDistanceMeasurement({
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
        const nextCoordinates = appendDistancePreviewPoint(
          currentDraft.coordinates,
          coordinate
        );
        const nextLinkedNodeGroupIds = appendDistancePreviewPoint(
          currentDraft.linkedNodeGroupIds,
          linkedNodeGroupId ?? null
        );

        if (nextCoordinates.length < 2) {
          drafts.set(toolType, {
            coordinates: nextCoordinates,
            linkedNodeGroupIds: nextLinkedNodeGroupIds,
          } satisfies AnnotationToolDraftState);
          return;
        }

        commitDistanceMeasurement({
          toolType,
          coordinates: nextCoordinates,
          linkedNodeGroupIds: nextLinkedNodeGroupIds,
          addAnnotation,
        });
        drafts.clear(toolType);
      },
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
        `[annotations-runtime] distance pointQuery invoked without an active onNodeCreated session handler.`
      );
    },
  },
  addAnnotation: {
    resolveOptions: resolveDistanceToolAddAnnotationOptions,
  },
  authoringVisuals: {
    createController: (context) =>
      createDistanceAuthoringController({
        toolType,
        context,
      }),
  },
  keyboard: {
    onKeyDown: ({ event, activeToolSession, sessionContext }) => {
      const action = resolveDistanceToolKeyAction(event);
      if (!action) {
        return false;
      }

      if (action === "cancelPreview") {
        activeToolSession?.discardDraft();
        event.preventDefault();
        return true;
      }

      if (action === "undoLastPoint") {
        const currentDraft = sessionContext.drafts.get(toolType);
        sessionContext.drafts.set(toolType, {
          coordinates: undoDistancePreviewPoint(currentDraft.coordinates),
          linkedNodeGroupIds: undoDistancePreviewPoint(
            currentDraft.linkedNodeGroupIds
          ),
        } satisfies AnnotationToolDraftState);
        event.preventDefault();
        return true;
      }

      return false;
    },
  },
  visualModels: {
    build: ({
      nodes,
      edges,
      linkedNodeGroups,
      annotationEntries,
      selectedAnnotationIds,
      setSelectedAnnotationId,
      onNodeLongPress,
    }) => {
      const {
        points,
        edges: edgeRenderModels,
        pointLabels,
      } = buildDistanceToolRenderModels({
        toolType,
        visuals: distanceToolSettings.visuals,
        labelTheme,
        getMeasurementLabel: (counter) =>
          formatMeasurementShortLabelToken(toolType, counter),
        nodes,
        edges,
        linkedNodeGroups,
        measurements: annotationEntries,
        selectedMeasurementIds: selectedAnnotationIds,
        onMeasurementSelect: setSelectedAnnotationId,
        onNodeLongPress,
      });

      return {
        points,
        edges: edgeRenderModels,
        pointLabels,
      };
    },
  },
  infoBox: {
    getSlots: getDistanceToolInfoBoxSlots,
  },
});
