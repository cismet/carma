import { faBuilding } from "@fortawesome/free-solid-svg-icons";
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
  annotationVisualStyles,
  resolveAreaOcclusionStyleOptions,
  resolveAnnotationLineStyleOptions,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
  type AreaOcclusionStyleOptions,
  type AnnotationLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import { createVerticalAreaAuthoringController } from "@carma-mapping/annotations/runtime";
import type { AnnotationToolDraftState } from "@carma-mapping/annotations/runtime";
import {
  appendVerticalAreaPreviewPoint,
  commitVerticalAreaMeasurement,
  undoVerticalAreaPreviewPoint,
} from "./vertical-area-tool-actions";
import { resolveAreaToolAddAnnotationOptions } from "../area-shared/resolve-area-tool-add-annotation-options";
import { createVerticalAreaToolInfoBoxSlots } from "./vertical-area-tool-info-box-slots";
import { buildVerticalAreaToolRenderModels } from "./vertical-area-tool-render-models";
import { ANNOTATION_DEFAULT_LABEL_THEME } from "@carma-mapping/annotations/runtime";
import type { DefaultAnnotationToolTexts } from "../annotation-mode-text";
import { defaultAnnotationToolTexts } from "../annotation-mode-text";
const { AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_AREA_VERTICAL;
const labelTheme = ANNOTATION_DEFAULT_LABEL_THEME;

export type VerticalAreaToolPluginOptions = {
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  annotationLineStyleOptions?: AnnotationLineStyleOptions;
  texts?: DefaultAnnotationToolTexts;
};

export const createVerticalAreaToolPlugin = ({
  occlusionStyleOptions,
  annotationLineStyleOptions,
  texts = defaultAnnotationToolTexts,
}: VerticalAreaToolPluginOptions = {}) => {
  const text = texts.verticalArea;
  const getVerticalAreaToolInfoBoxSlots = createVerticalAreaToolInfoBoxSlots(
    toolType,
    {
      headingTitle: text.headingTitle,
      headingColor: labelTheme.scheme.colorPrimary,
      formatLabelToken: (counter) =>
        formatMeasurementShortLabelToken(toolType, counter),
      actionLabels: texts.actions,
      navigationLabels: texts.navigation,
      contentLabels: text.contentLabels,
    }
  );
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const resolvedLineStyleOptions = resolveAnnotationLineStyleOptions(
    annotationLineStyleOptions
  );
  const verticalAreaToolVisuals = {
    edge: withEdgeVisualStyle(annotationVisualStyles.edge, {
      strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
      overlayDashPattern: resolvedLineStyleOptions.overlayDashPattern,
    }),
    point: withPointMarkerVisualStyle(annotationVisualStyles.point),
  };

  return createMeasurementToolPlugin({
    id: toolType,
    annotationType: toolType,
    descriptor: {
      id: toolType,
      order: 50,
      label: text.label,
      tooltip: text.tooltip,
      shortcutKey: "V",
      icon: <FontAwesomeIcon icon={faBuilding} />,
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
          const nextMeasurement = commitVerticalAreaMeasurement(
            toolType,
            drafts.get(toolType).coordinates,
            drafts.get(toolType).linkedNodeGroupIds,
            {
              addAnnotation,
            },
            toolType
          );

          drafts.clear(toolType);
          return Boolean(nextMeasurement);
        },
        discardDraft: () => {
          drafts.clear(toolType);
        },
        onNodeCreated: (coordinate, linkedNodeGroupId) => {
          const currentDraft = drafts.get(toolType);
          const nextCoordinates = appendVerticalAreaPreviewPoint(
            currentDraft.coordinates,
            coordinate
          );
          const nextLinkedNodeGroupIds = appendVerticalAreaPreviewPoint(
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

          commitVerticalAreaMeasurement(
            toolType,
            nextCoordinates,
            nextLinkedNodeGroupIds,
            {
              addAnnotation,
            },
            toolType
          );
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
      resolveOptions: resolveAreaToolAddAnnotationOptions,
    },
    authoringVisuals: {
      createController: (context) =>
        createVerticalAreaAuthoringController({
          context,
          occlusionStyleOptions: resolvedOcclusionStyleOptions,
          annotationLineStyleOptions,
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
            coordinates: undoVerticalAreaPreviewPoint(currentDraft.coordinates),
            linkedNodeGroupIds: undoVerticalAreaPreviewPoint(
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
        annotationEntries,
        selectedAnnotationIds,
        setSelectedAnnotationId,
        formatOptions,
        onNodeLongPress,
      }) => {
        const { points, edges, polygonFills, pointLabels } =
          buildVerticalAreaToolRenderModels(
            toolType,
            nodes,
            annotationEntries,
            {
              visuals: verticalAreaToolVisuals,
              formatOptions,
              selectedAnnotationIds: selectedAnnotationIds,
              onSelect: setSelectedAnnotationId,
              onNodeLongPress,
              occlusionStyleOptions: resolvedOcclusionStyleOptions,
            }
          );

        return {
          points,
          edges,
          polygonFills,
          pointLabels,
        };
      },
    },
    infoBox: {
      getSlots: getVerticalAreaToolInfoBoxSlots,
    },
  });
};

export const verticalAreaToolPlugin = createVerticalAreaToolPlugin();
