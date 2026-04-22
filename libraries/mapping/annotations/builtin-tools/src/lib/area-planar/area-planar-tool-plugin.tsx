import { VectorTrapezoidIcon } from "@carma-commons/ui/components";
import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  formatMeasurementShortLabelToken,
  resolveAnnotationCommonShortcutAction,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { createPolygonAuthoringController } from "@carma-mapping/annotations/runtime";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "@carma-mapping/annotations/runtime";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "@carma-mapping/annotations/runtime";
import {
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolDraftState } from "@carma-mapping/annotations/runtime";
import {
  appendAreaPreviewPoint,
  commitAreaMeasurement,
  undoAreaPreviewPoint,
} from "../area-shared/node-chain-area-tool-actions";
import { resolveAreaToolAddAnnotationOptions } from "../area-shared/resolve-area-tool-add-annotation-options";
import { createNodeChainAreaToolInfoBoxSlots } from "../area-shared/node-chain-area-tool-info-box-slots";
import {
  buildNodeChainAreaToolRenderModels,
  createNodeChainAreaToolVisuals,
} from "../area-shared/node-chain-area-tool-render-models";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "@carma-mapping/annotations/runtime";
import { formatGermanCardinalBearing } from "@carma-mapping/annotations/runtime";
const { AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_AREA_PLANAR;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;
const areaPlanarToolVisuals = createNodeChainAreaToolVisuals({
  fillType: toolType,
});
const getAreaPlanarToolInfoBoxSlots = createNodeChainAreaToolInfoBoxSlots(
  toolType,
  {
    headingTitle: "Plane Fläche (Dachfläche)",
    headingColor: labelTheme.scheme.colorPrimary,
    formatMeasurementLabelToken: (counter) =>
      formatMeasurementShortLabelToken(toolType, counter),
    formatBearing: (bearingDeg) => formatGermanCardinalBearing(bearingDeg),
  }
);

export const areaPlanarToolPlugin = createMeasurementToolPlugin({
  id: toolType,
  annotationType: toolType,
  descriptor: {
    id: toolType,
    order: 55,
    label: "Dach",
    tooltip: "Dachfläche messen",
    shortcutKey: "C",
    icon: <VectorTrapezoidIcon fontSize="1.33em" />,
  },
  helpText: [
    "Punkte nacheinander setzen, um eine Dachfläche zu erstellen.",
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
        visuals: areaPlanarToolVisuals,
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
