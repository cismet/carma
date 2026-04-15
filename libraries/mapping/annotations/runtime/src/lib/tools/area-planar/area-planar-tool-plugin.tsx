import { VectorTrapezoidIcon } from "@carma-commons/ui/components";
import {
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
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
import { resolveNodeChainAreaToolKeyAction } from "../area-shared/node-chain-area-tool-bindings";
import { createNodeChainAreaToolInfoBoxSlots } from "../area-shared/node-chain-area-tool-info-box-slots";
import { buildNodeChainAreaToolRenderModels } from "../area-shared/node-chain-area-tool-render-models";
import { createNodeChainAreaToolSettings } from "../area-shared/node-chain-area-tool-settings";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "../../config/annotation-measurement-label-themes";
const { AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_AREA_PLANAR;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const badgeStyle = {
  ...DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType],
  backgroundColor: labelTheme.scheme.colorPrimary,
  textColor: labelTheme.scheme.textColor,
};
const areaPlanarToolSettings = createNodeChainAreaToolSettings({
  badgeStyle,
  fill: "rgba(239, 223, 145, 0.25)",
  selectedFill: "rgba(239, 223, 145, 0.35)",
});
const getAreaPlanarToolInfoBoxSlots = createNodeChainAreaToolInfoBoxSlots(
  toolType,
  {
    headingTitle: "Dach",
    headingColor: labelTheme.scheme.colorPrimary,
    formatMeasurementLabelToken: (counter) =>
      formatMeasurementShortLabelToken(toolType, counter),
  }
);

export const areaPlanarToolPlugin = createMeasurementToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 55,
    label: "Dach",
    tooltip: "Dachfläche messen",
    icon: <VectorTrapezoidIcon fontSize="1.33em" />,
  },
  helpText: [
    "Punkte nacheinander setzen, um eine Dachfläche zu erstellen.",
    "Doppelklick schliesst die Fläche ab, Escape verwirft den Entwurf.",
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
        visuals: areaPlanarToolSettings.visuals,
        nodes,
        measurements: annotationEntries,
        selectedMeasurementIds: selectedAnnotationIds,
        fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
        formatOptions,
        onMeasurementSelect: setSelectedAnnotationId,
      }),
  },
  infoBox: {
    getSlots: getAreaPlanarToolInfoBoxSlots,
  },
});
