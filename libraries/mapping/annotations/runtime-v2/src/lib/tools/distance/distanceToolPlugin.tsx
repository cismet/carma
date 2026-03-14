import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ANNOTATION_TYPE_DISTANCE,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  createMeasurementToolPlugin,
  NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import {
  clearDistancePreviewCoordinates,
  setDistancePreviewCoordinates,
} from "../../store";
import {
  appendDistancePreviewPoint,
  commitDistanceMeasurement,
  undoDistancePreviewPoint,
} from "./distanceToolActions";
import { resolveDistanceToolKeyAction } from "./distanceToolBindings";
import { buildDistanceToolRenderModels } from "./distanceToolRenderModels";
import { createDistanceToolSettings } from "./distanceToolSettings";

const toolType = ANNOTATION_TYPE_DISTANCE;
const badgeStyle = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType];
const distanceToolSettings = createDistanceToolSettings(badgeStyle);

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
    "Zwei Punkte klicken, um eine Distanzmessung zu erstellen.",
    "Backspace entfernt den letzten Vorschaupunkt, Escape verwirft ihn.",
  ],
  capabilities: NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
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
          coordinates: getState().draftState.distancePreviewCoordinates,
          addAnnotation,
        });

        dispatch(clearDistancePreviewCoordinates());
        return Boolean(nextMeasurement);
      },
      discardDraft: () => {
        dispatch(clearDistancePreviewCoordinates());
      },
      onNodeCreated: (coordinate) => {
        const nextCoordinates = appendDistancePreviewPoint(
          getState().draftState.distancePreviewCoordinates,
          coordinate
        );

        if (nextCoordinates.length < 2) {
          dispatch(
            setDistancePreviewCoordinates({
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
        dispatch(clearDistancePreviewCoordinates());
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
          setDistancePreviewCoordinates({
            coordinates: undoDistancePreviewPoint(
              sessionContext.getState().draftState.distancePreviewCoordinates
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
      state,
      nodes,
      annotationEntries,
      selectedAnnotationId,
      setSelectedAnnotationId,
      onNodeLongPress,
    }) => {
      const { points, edges, pointLabels } = buildDistanceToolRenderModels({
        toolType,
        visuals: distanceToolSettings.visuals,
        badgeStyle,
        getMeasurementLabel: (counter) =>
          formatMeasurementShortLabelToken(toolType, counter),
        nodes,
        measurements: annotationEntries,
        previewCoordinates: state.draftState.distancePreviewCoordinates,
        selectedMeasurementId: selectedAnnotationId,
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
});
