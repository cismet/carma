import { faMessage } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "@carma-mapping/annotations/runtime";
import {
  BASE_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
} from "@carma-mapping/annotations/runtime";
import { createLabelToolInfoBoxSlots } from "./label-tool-info-box-slots";
import {
  createLabelMeasurement,
  getDefaultLabelDisplayName,
} from "./label-tool-actions";
import { buildLabelToolRenderModels } from "./label-tool-render-models";
const { LABEL: ANNOTATION_TYPE_LABEL } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_LABEL;
const getLabelToolInfoBoxSlots = createLabelToolInfoBoxSlots(toolType);

export const labelToolPlugin = createMeasurementToolPlugin({
  id: toolType,
  annotationType: toolType,
  descriptor: {
    id: toolType,
    order: 80,
    label: "Beschriftung",
    tooltip: "Beschriftung platzieren",
    shortcutKey: "B",
    icon: <FontAwesomeIcon icon={faMessage} />,
  },
  helpText: [
    "Klicken, um eine Beschriftung zu platzieren.",
    "Aussehen und Text koennen danach direkt im Info-Panel angepasst werden.",
  ],
  capabilities: [
    ...BASE_MEASUREMENT_PLUGIN_CAPABILITIES,
    ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX,
  ],
  session: {
    createSession: ({ getState, setActiveToolType, addAnnotation }) => ({
      toolType,
      requestStart: () => {
        setActiveToolType(toolType);
      },
      requestFinish: () => false,
      discardDraft: () => undefined,
      onNodeCreated: (coordinate, linkedNodeGroupId) => {
        const labelCount = getState().annotationEntries.filter(
          (entry) => entry.toolType === toolType
        ).length;
        createLabelMeasurement({
          toolType,
          coordinate,
          displayName: getDefaultLabelDisplayName(labelCount + 1),
          addAnnotation,
          linkedNodeGroupId,
          sourceToolId: toolType,
        });
      },
    }),
  },
  pointQuery: {
    onPointCreated: ({ coordinate, linkedNodeGroupId, activeToolSession }) => {
      activeToolSession?.onNodeCreated?.(coordinate, linkedNodeGroupId);
    },
  },
  visualModels: {
    build: ({
      nodes,
      annotationEntries,
      selectedAnnotationIds,
      setSelectedAnnotationId,
      onNodeLongPress,
    }) => {
      const { points, pointLabels } = buildLabelToolRenderModels({
        toolType,
        nodes,
        measurements: annotationEntries,
        selectedMeasurementIds: selectedAnnotationIds,
        onMeasurementSelect: setSelectedAnnotationId,
        onNodeLongPress,
      });

      return {
        points,
        edges: [],
        pointLabels,
      };
    },
  },
  infoBox: {
    getSlots: getLabelToolInfoBoxSlots,
  },
});
