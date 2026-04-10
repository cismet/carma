import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  ANNOTATION_TYPE_DISTANCE,
  formatMeasurementShortLabelToken,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  createMeasurementToolPlugin,
  NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import {
  clearDraftCoordinatesByToolType,
  getDraftCoordinatesForTool,
  setDraftCoordinatesByToolType,
} from "../../store";
import {
  appendDistancePreviewPoint,
  commitDistanceMeasurement,
  undoDistancePreviewPoint,
} from "./distanceToolActions";
import { resolveDistanceToolKeyAction } from "./distanceToolBindings";
import { createDistanceToolInfoBoxSlots } from "./distanceToolInfoBoxSlots";
import { createDistanceToolPreviewController } from "./createDistanceToolPreviewController";
import { buildDistanceToolRenderModels } from "./distanceToolRenderModels";
import { createDistanceToolSettings } from "./distanceToolSettings";
import { resolveAnnotationMeasurementLabelTheme } from "../../config/annotationMeasurementLabelThemes";
const toolType = ANNOTATION_TYPE_DISTANCE;
const labelTheme = resolveAnnotationMeasurementLabelTheme(toolType);
const badgeStyle = {
  backgroundColor: labelTheme.scheme.badgeBackgroundColor,
  textColor: labelTheme.scheme.textColor,
  selectionColor: labelTheme.selection.glowColor,
};
const distanceToolSettings = createDistanceToolSettings(badgeStyle);
const getDistanceToolInfoBoxSlots = createDistanceToolInfoBoxSlots(toolType, {
  headingTitle: "Distanzmessung",
  headingColor: labelTheme.scheme.badgeBackgroundColor,
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
        const nextMeasurement = commitDistanceMeasurement({
          toolType,
          coordinates: getDraftCoordinatesForTool(
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
      onNodeCreated: (coordinate) => {
        const nextCoordinates = appendDistancePreviewPoint(
          getDraftCoordinatesForTool(getState().draftState, toolType),
          coordinate
        );

        if (nextCoordinates.length < 2) {
          dispatch(
            setDraftCoordinatesByToolType({
              toolType,
              coordinates: nextCoordinates,
            })
          );
          return;
        }

        commitDistanceMeasurement({
          toolType,
          coordinates: nextCoordinates,
          addAnnotation,
        });
        dispatch(clearDraftCoordinatesByToolType(toolType));
      },
    }),
  },
  pointQuery: {
    onPointCreated: ({ coordinate, activeToolSession }) => {
      if (activeToolSession?.onNodeCreated) {
        activeToolSession.onNodeCreated(coordinate);
        return;
      }

      // eslint-disable-next-line no-console
      console.info(
        `[annotations-runtime] distance pointQuery invoked without an active onNodeCreated session handler.`
      );
    },
  },
  preview: {
    createController: (context) =>
      createDistanceToolPreviewController({
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
        sessionContext.dispatch(
          setDraftCoordinatesByToolType({
            toolType,
            coordinates: undoDistancePreviewPoint(
              getDraftCoordinatesForTool(
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
    }) => {
      const { points, edges, pointLabels } = buildDistanceToolRenderModels({
        toolType,
        visuals: distanceToolSettings.visuals,
        labelTheme,
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
    getSlots: getDistanceToolInfoBoxSlots,
  },
});
