import { faVectorSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  createMeasurementToolPlugin,
  NODE_CHAIN_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import {
  clearVerticalAreaPreviewCoordinates,
  setVerticalAreaPreviewCoordinates,
} from "../../store";
import {
  appendVerticalAreaPreviewPoint,
  commitVerticalAreaMeasurement,
  undoVerticalAreaPreviewPoint,
} from "./verticalAreaToolActions";
import { resolveVerticalAreaToolKeyAction } from "./verticalAreaToolBindings";
import { createVerticalAreaToolInfoBoxSlots } from "./verticalAreaToolInfoBoxSlots";
import { buildVerticalAreaToolRenderModels } from "./verticalAreaToolRenderModels";
import { createVerticalAreaToolSettings } from "./verticalAreaToolSettings";

const toolType = ANNOTATION_TYPE_AREA_VERTICAL;
const badgeStyle = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType];
const verticalAreaToolSettings = createVerticalAreaToolSettings(badgeStyle);
const getVerticalAreaToolInfoBoxSlots = createVerticalAreaToolInfoBoxSlots(
  toolType,
  {
    headingTitle: "Vertikale Fläche",
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
    icon: <FontAwesomeIcon icon={faVectorSquare} />,
  },
  helpText: [
    "Ersten Eckpunkt klicken, dann den diagonal gegenüberliegenden Eckpunkt setzen.",
    "Die Runtime erstellt daraus direkt ein echtes vertikales Rechteck.",
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
        const nextMeasurement = commitVerticalAreaMeasurement(
          toolType,
          getState().draftState.verticalAreaPreviewCoordinates,
          {
            addAnnotation,
          }
        );

        dispatch(clearVerticalAreaPreviewCoordinates());
        return Boolean(nextMeasurement);
      },
      discardDraft: () => {
        dispatch(clearVerticalAreaPreviewCoordinates());
      },
      onNodeCreated: (coordinate) => {
        const nextCoordinates = appendVerticalAreaPreviewPoint(
          getState().draftState.verticalAreaPreviewCoordinates,
          coordinate
        );

        if (nextCoordinates.length < 2) {
          dispatch(
            setVerticalAreaPreviewCoordinates({
              coordinates: nextCoordinates,
            })
          );
          return;
        }

        commitVerticalAreaMeasurement(toolType, nextCoordinates, {
          addAnnotation,
        });
        dispatch(clearVerticalAreaPreviewCoordinates());
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
        `[annotations-runtime] vertical area pointQuery invoked without an active onNodeCreated session handler.`
      );
    },
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
        sessionContext.dispatch(
          setVerticalAreaPreviewCoordinates({
            coordinates: undoVerticalAreaPreviewPoint(
              sessionContext.getState().draftState
                .verticalAreaPreviewCoordinates
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
      const { points, edges, pointLabels } = buildVerticalAreaToolRenderModels(
        toolType,
        nodes,
        annotationEntries,
        {
          visuals: verticalAreaToolSettings.visuals,
          badgeStyle,
          getMeasurementLabel: (counter) =>
            formatMeasurementShortLabelToken(toolType, counter),
          previewCoordinates: state.draftState.verticalAreaPreviewCoordinates,
          selectedMeasurementId: selectedAnnotationId,
          onMeasurementSelect: setSelectedAnnotationId,
          onNodeLongPress,
        }
      );

      return {
        points,
        edges,
        pointLabels,
      };
    },
  },
  infoBox: {
    getSlots: getVerticalAreaToolInfoBoxSlots,
  },
});
