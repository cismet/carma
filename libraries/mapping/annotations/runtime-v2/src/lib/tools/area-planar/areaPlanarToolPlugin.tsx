import { VectorTrapezoidIcon } from "@carma-commons/ui/components";
import {
  ANNOTATION_TYPE_AREA_PLANAR,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import { createPolygonToolPreviewController } from "../../interaction/createPolygonToolPreviewController";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "../../render/measurementRenderModels";
import {
  clearDraftCoordinatesByToolType,
  getDraftCoordinatesForTool,
  getDraftLinkedNodeGroupIdsForTool,
  setDraftLinkedNodeGroupIdsByToolType,
  setDraftCoordinatesByToolType,
} from "../../store";
import {
  createMeasurementToolPlugin,
  NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import {
  appendAreaPreviewPoint,
  commitAreaMeasurement,
  undoAreaPreviewPoint,
} from "../area-shared/nodeChainAreaToolActions";
import { resolveNodeChainAreaToolKeyAction } from "../area-shared/nodeChainAreaToolBindings";
import { createNodeChainAreaToolInfoBoxSlots } from "../area-shared/nodeChainAreaToolInfoBoxSlots";
import { buildNodeChainAreaToolRenderModels } from "../area-shared/nodeChainAreaToolRenderModels";
import { createNodeChainAreaToolSettings } from "../area-shared/nodeChainAreaToolSettings";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "../../config/annotationMeasurementLabelThemes";

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
  capabilities: [...NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES, "infoBox"],
  session: {
    createSession: ({
      dispatch,
      getState,
      setActiveToolType,
      addAnnotation,
    }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => {
        const nextMeasurement = commitAreaMeasurement({
          toolType,
          coordinates: getDraftCoordinatesForTool(
            getState().draftState,
            toolType
          ),
          linkedNodeGroupIds: getDraftLinkedNodeGroupIdsForTool(
            getState().draftState,
            toolType
          ),
          addAnnotation,
        });

        dispatch(clearDraftCoordinatesByToolType(toolType));
        return Boolean(nextMeasurement);
      },
      discardDraft: () => {
        dispatch(clearDraftCoordinatesByToolType(toolType));
      },
      onNodeCreated: (coordinate, linkedNodeGroupId) => {
        dispatch(
          setDraftCoordinatesByToolType({
            toolType,
            coordinates: appendAreaPreviewPoint(
              getDraftCoordinatesForTool(getState().draftState, toolType),
              coordinate
            ),
          })
        );
        dispatch(
          setDraftLinkedNodeGroupIdsByToolType({
            toolType,
            linkedNodeGroupIds: appendAreaPreviewPoint(
              getDraftLinkedNodeGroupIdsForTool(
                getState().draftState,
                toolType
              ),
              linkedNodeGroupId ?? null
            ),
          })
        );
      },
      finishesOnLoopClosure: true,
    }),
  },
  pointQuery: {
    onPointCreated: ({ coordinate, linkedNodeGroupId, activeToolSession }) => {
      activeToolSession?.onNodeCreated?.(coordinate, linkedNodeGroupId);
    },
  },
  preview: {
    createController: (context) =>
      createPolygonToolPreviewController({
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
        sessionContext.dispatch(
          setDraftCoordinatesByToolType({
            toolType,
            coordinates: undoAreaPreviewPoint(
              getDraftCoordinatesForTool(
                sessionContext.getState().draftState,
                toolType
              )
            ),
          })
        );
        sessionContext.dispatch(
          setDraftLinkedNodeGroupIdsByToolType({
            toolType,
            linkedNodeGroupIds: undoAreaPreviewPoint(
              getDraftLinkedNodeGroupIdsForTool(
                sessionContext.getState().draftState,
                toolType
              )
            ),
          })
        );
        event.preventDefault();
        return true;
      }

      return false;
    },
  },
  renderLayer: {
    build: ({
      nodes,
      annotationEntries,
      selectedAnnotationIds,
      setSelectedAnnotationId,
      onNodeLongPress,
      formatOptions,
    }) =>
      buildNodeChainAreaToolRenderModels({
        toolType,
        visuals: areaPlanarToolSettings.visuals,
        badgeStyle,
        getMeasurementLabel: (counter) =>
          formatMeasurementShortLabelToken(toolType, counter),
        nodes,
        measurements: annotationEntries,
        selectedMeasurementIds: selectedAnnotationIds,
        fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
        formatOptions,
        onMeasurementSelect: setSelectedAnnotationId,
        onNodeLongPress,
      }),
  },
  infoBox: {
    getSlots: getAreaPlanarToolInfoBoxSlots,
  },
});
