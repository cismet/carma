import { VectorSquareIcon } from "@carma-commons/ui/components";
import {
  formatMeasurementShortLabelToken,
  type AnnotationToolType,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { createPolygonAuthoringController } from "../../interaction/create-polygon-authoring-controller";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "../../render/measurement-render-models";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "../annotation-tool-plugin.types";
import {
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
} from "../plugin-factories";
import type { AnnotationToolDraftState } from "../annotation-tool-plugin.types";
import {
  appendAreaPreviewPoint,
  commitAreaMeasurement,
  undoAreaPreviewPoint,
} from "../area-shared/node-chain-area-tool-actions";
import { resolveAreaToolAddAnnotationOptions } from "../area-shared/resolve-area-tool-add-annotation-options";
import { resolveNodeChainAreaToolKeyAction } from "../area-shared/node-chain-area-tool-bindings";
import { createNodeChainAreaToolInfoBoxSlots } from "../area-shared/node-chain-area-tool-info-box-slots";
import {
  buildNodeChainAreaToolRenderModels,
  createNodeChainAreaToolVisuals,
} from "../area-shared/node-chain-area-tool-render-models";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "../../config/annotation-measurement-label-themes";
const { AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_AREA_GROUND;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const areaGroundToolVisuals = createNodeChainAreaToolVisuals({
  fillType: toolType,
});
const getAreaGroundToolInfoBoxSlots = createNodeChainAreaToolInfoBoxSlots(
  toolType,
  {
    headingTitle: "Grundriss",
    headingColor: labelTheme.scheme.colorPrimary,
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
        const nextMeasurement = commitAreaMeasurement({
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
          coordinates: appendAreaPreviewPoint(
            currentDraft.coordinates,
            coordinate
          ),
          linkedNodeGroupIds: appendAreaPreviewPoint(
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
      activeToolSession?.onNodeCreated?.(coordinate, linkedNodeGroupId);
    },
  },
  addAnnotation: {
    resolveOptions: resolveAreaToolAddAnnotationOptions,
  },
  authoringVisuals: {
    createController: (context) =>
      createPolygonAuthoringController({
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
        const currentDraft = sessionContext.drafts.get(toolType);
        sessionContext.drafts.set(toolType, {
          coordinates: undoAreaPreviewPoint(currentDraft.coordinates),
          linkedNodeGroupIds: undoAreaPreviewPoint(
            currentDraft.linkedNodeGroupIds
          ),
        });
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
    }) =>
      buildNodeChainAreaToolRenderModels({
        toolType,
        visuals: areaGroundToolVisuals,
        nodes,
        measurements: annotationEntries,
        selectedMeasurementIds: selectedAnnotationIds,
        fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.GROUND,
        formatOptions,
        onMeasurementSelect: setSelectedAnnotationId,
      }),
  },
  infoBox: {
    getSlots: getAreaGroundToolInfoBoxSlots,
  },
});
