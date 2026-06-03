import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  formatMeasurementShortLabelToken,
  resolveAnnotationCommonShortcutAction,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "@carma-mapping/annotations/runtime";
import {
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
  measurementVisualStyles,
  resolveMeasurementLineStyleOptions,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "@carma-mapping/annotations/runtime";
import type {
  AnnotationToolDraftState,
  MeasurementLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import {
  appendDistancePreviewPoint,
  commitDistanceMeasurement,
  undoDistancePreviewPoint,
} from "./distance-tool-actions";
import { resolveDistanceToolAddAnnotationOptions } from "./resolve-distance-tool-add-annotation-options";
import { createDistanceToolInfoBoxSlots } from "./distance-tool-info-box-slots";
import { createDistanceAuthoringController } from "./create-distance-authoring-controller";
import { buildDistanceToolRenderModels } from "./distance-tool-render-models";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "@carma-mapping/annotations/runtime";
import type { DefaultAnnotationToolTexts } from "../annotation-mode-text";
import { defaultAnnotationToolTexts } from "../annotation-mode-text";
const { DISTANCE: ANNOTATION_TYPE_DISTANCE } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_DISTANCE;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;

export type DistanceToolPluginOptions = {
  measurementLineStyleOptions?: MeasurementLineStyleOptions;
  texts?: DefaultAnnotationToolTexts;
};

export const createDistanceToolPlugin = ({
  measurementLineStyleOptions,
  texts = defaultAnnotationToolTexts,
}: DistanceToolPluginOptions = {}) => {
  const text = texts.distance;
  const getDistanceToolInfoBoxSlots = createDistanceToolInfoBoxSlots(toolType, {
    headingTitle: text.headingTitle,
    headingColor: labelTheme.scheme.colorPrimary,
    formatMeasurementLabelToken: (counter) =>
      formatMeasurementShortLabelToken(toolType, counter),
    actionLabels: texts.actions,
    navigationLabels: texts.navigation,
    metricLabels: text.metricLabels,
  });
  const resolvedLineStyleOptions = resolveMeasurementLineStyleOptions(
    measurementLineStyleOptions
  );
  const distanceToolVisuals = {
    edge: withEdgeVisualStyle(measurementVisualStyles.edge, {
      strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
      overlayDashPattern: resolvedLineStyleOptions.overlayDashPattern,
      overlayDashed: true,
    }),
    point: withPointMarkerVisualStyle(measurementVisualStyles.point),
  };

  return createMeasurementToolPlugin({
    id: toolType,
    annotationType: toolType,
    descriptor: {
      id: toolType,
      order: 30,
      label: text.label,
      tooltip: text.tooltip,
      shortcutKey: "D",
      icon: <FontAwesomeIcon icon={faRuler} />,
    },
    helpText: text.helpText,
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
            sourceToolId: toolType,
          });
          drafts.clear(toolType);
        },
      }),
    },
    pointQuery: {
      onPointCreated: ({
        coordinate,
        linkedNodeGroupId,
        activeToolSession,
      }) => {
        if (activeToolSession?.onNodeCreated) {
          activeToolSession.onNodeCreated(coordinate, linkedNodeGroupId);
        }
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
          measurementLineStyleOptions: resolvedLineStyleOptions,
        }),
    },
    keyboard: {
      onKeyDown: ({ event, activeToolSession, sessionContext }) => {
        const shortcutAction = resolveAnnotationCommonShortcutAction(event);
        if (
          shortcutAction ===
          ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL
        ) {
          activeToolSession?.discardDraft();
          event.preventDefault();
          return true;
        }

        if (
          shortcutAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT
        ) {
          const currentDraft = sessionContext.drafts.get(toolType);
          if (currentDraft.coordinates.length === 0) {
            return false;
          }

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
          visuals: distanceToolVisuals,
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
};

export const distanceToolPlugin = createDistanceToolPlugin();
