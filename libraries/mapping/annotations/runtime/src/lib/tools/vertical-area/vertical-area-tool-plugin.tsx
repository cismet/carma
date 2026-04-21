import { faBuilding } from "@fortawesome/free-solid-svg-icons";
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
import { createVerticalAreaAuthoringController } from "../../interaction/create-vertical-area-authoring-controller";
import type { AnnotationToolDraftState } from "../annotation-tool-plugin.types";
import {
  appendVerticalAreaPreviewPoint,
  commitVerticalAreaMeasurement,
  undoVerticalAreaPreviewPoint,
} from "./vertical-area-tool-actions";
import { resolveAreaToolAddAnnotationOptions } from "../area-shared/resolve-area-tool-add-annotation-options";
import { resolveVerticalAreaToolKeyAction } from "./vertical-area-tool-bindings";
import { createVerticalAreaToolInfoBoxSlots } from "./vertical-area-tool-info-box-slots";
import { buildVerticalAreaToolRenderModels } from "./vertical-area-tool-render-models";
import { createVerticalAreaToolSettings } from "./vertical-area-tool-settings";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "../../config/annotation-measurement-label-themes";
const { AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_AREA_VERTICAL;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const verticalAreaToolSettings = createVerticalAreaToolSettings();
const getVerticalAreaToolInfoBoxSlots = createVerticalAreaToolInfoBoxSlots(
  toolType,
  {
    headingTitle: "Vertikale Fläche",
    headingColor: labelTheme.scheme.colorPrimary,
    formatMeasurementLabelToken: (counter) =>
      formatMeasurementShortLabelToken(toolType, counter),
  }
);

export const verticalAreaToolPlugin = createMeasurementToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 50,
    label: "Vertikal",
    tooltip: "Vertikale Fläche messen",
    icon: <FontAwesomeIcon icon={faBuilding} />,
  },
  helpText: [
    "Ersten Eckpunkt klicken, dann den diagonal gegenüberliegenden Eckpunkt setzen.",
    "Die Runtime erstellt daraus direkt ein echtes vertikales Rechteck.",
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
        const nextMeasurement = commitVerticalAreaMeasurement(
          toolType,
          drafts.get(toolType).coordinates,
          drafts.get(toolType).linkedNodeGroupIds,
          {
            addAnnotation,
          }
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
          }
        );
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
        `[annotations-runtime] vertical area pointQuery invoked without an active onNodeCreated session handler.`
      );
    },
  },
  addAnnotation: {
    resolveOptions: resolveAreaToolAddAnnotationOptions,
  },
  authoringVisuals: {
    createController: (context) =>
      createVerticalAreaAuthoringController(context),
  },
  keyboard: {
    onKeyDown: ({ event, activeToolSession, sessionContext }) => {
      const action = resolveVerticalAreaToolKeyAction(event);
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
    }) => {
      const { points, edges, polygonFills, pointLabels } =
        buildVerticalAreaToolRenderModels(toolType, nodes, annotationEntries, {
          visuals: verticalAreaToolSettings.visuals,
          formatOptions,
          selectedMeasurementIds: selectedAnnotationIds,
          onMeasurementSelect: setSelectedAnnotationId,
        });

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
