import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ANNOTATION_TYPE_POINT,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  formatNumber,
  isKeyboardTargetEditable,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  createMeasurementToolPlugin,
  POINT_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import { createPointToolInfoBoxSlots } from "./pointToolInfoBoxSlots";
import { buildPointToolRenderModels } from "./pointToolRenderModels";
import {
  addPointMeasurement,
  removeLatestPointMeasurement,
} from "./pointToolActions";
import { resolvePointToolKeyAction } from "./pointToolBindings";
import { createPointToolSettings } from "./pointToolSettings";

const toolType = ANNOTATION_TYPE_POINT;
const badgeStyle = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType];
const pointToolSettings = createPointToolSettings(badgeStyle);
const getPointToolInfoBoxSlots = createPointToolInfoBoxSlots({
  toolType,
  headingTitle: "Punktmessung",
  formatMeasurementLabelToken: (counter) =>
    formatMeasurementShortLabelToken(toolType, counter),
  formatCoordinateValue: (value) => formatNumber(value),
});

export const pointToolPlugin = createMeasurementToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 20,
    label: "Punktmessung",
    tooltip: "Punkt messen",
    icon: <FontAwesomeIcon icon={faLocationDot} />,
  },
  helpText: [
    "Klicken, um eine Punktmessung zu setzen.",
    "Jeder Klick erstellt sofort eine neue Punktmessung.",
  ],
  capabilities: POINT_MEASUREMENT_PLUGIN_CAPABILITIES,
  session: {
    createSession: ({ setActiveToolType }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => false,
      discardDraft: () => undefined,
    }),
  },
  pointQuery: {
    onPointCreated: ({ coordinate, sessionContext }) => {
      addPointMeasurement({
        toolType,
        coordinate,
        addAnnotation: sessionContext.addAnnotation,
      });
    },
  },
  keyboard: {
    onKeyDown: ({ event, sessionContext }) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isKeyboardTargetEditable(event.target)
      ) {
        return false;
      }

      const action = resolvePointToolKeyAction(event);
      if (!action) {
        return false;
      }

      if (action === "removeLatestPoint") {
        const removed = removeLatestPointMeasurement({
          toolType,
          state: sessionContext.getState(),
          dispatch: sessionContext.dispatch,
        });
        if (!removed) {
          return false;
        }

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
      selectedAnnotationId,
      setSelectedAnnotationId,
    }) => {
      const { points, pointLabels } = buildPointToolRenderModels({
        toolType,
        visuals: pointToolSettings.visuals,
        badgeStyle,
        getMeasurementLabel: (counter) =>
          formatMeasurementShortLabelToken(toolType, counter),
        nodes,
        measurements: annotationEntries,
        selectedMeasurementId: selectedAnnotationId,
        onMeasurementSelect: setSelectedAnnotationId,
      });

      return {
        points,
        edges: [],
        pointLabels,
      };
    },
  },
  infoBox: {
    getSlots: getPointToolInfoBoxSlots,
  },
});
