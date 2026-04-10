import { faMessage } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  ANNOTATION_TYPE_LABEL,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  getPendingAnnotationIdForTool,
  removeAnnotationById,
  setPendingAnnotationIdByToolType,
} from "../../store";
import {
  createMeasurementToolPlugin,
  POINT_MEASUREMENT_PLUGIN_CAPABILITIES,
} from "../pluginFactories";
import { createLabelToolInfoBoxSlots } from "./labelToolInfoBoxSlots";
import {
  createLabelMeasurement,
  getDefaultLabelDisplayName,
} from "./labelToolActions";
import { buildLabelToolRenderModels } from "./labelToolRenderModels";
import { createLabelToolSettings } from "./labelToolSettings";

const toolType = ANNOTATION_TYPE_LABEL;
const badgeStyle = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[toolType];
const labelToolSettings = createLabelToolSettings(badgeStyle);
const getLabelToolInfoBoxSlots = createLabelToolInfoBoxSlots(toolType);

export const labelToolPlugin = createMeasurementToolPlugin({
  id: toolType satisfies AnnotationToolType,
  descriptor: {
    id: toolType,
    order: 80,
    label: "Beschriftung",
    tooltip: "Beschriftung platzieren",
    icon: <FontAwesomeIcon icon={faMessage} />,
  },
  helpText: [
    "Klicken, um eine Beschriftung zu platzieren.",
    "Die neue Beschriftung bleibt aktiv, bis sie bestätigt oder verworfen wird.",
  ],
  capabilities: [...POINT_MEASUREMENT_PLUGIN_CAPABILITIES, "infoBox"],
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
        const pendingAnnotationId = getPendingAnnotationIdForTool(
          getState().draftState,
          toolType
        );
        if (!pendingAnnotationId) {
          return false;
        }

        dispatch(
          setPendingAnnotationIdByToolType({
            toolType,
            annotationId: null,
          })
        );
        return true;
      },
      discardDraft: () => {
        const pendingAnnotationId = getPendingAnnotationIdForTool(
          getState().draftState,
          toolType
        );
        if (!pendingAnnotationId) {
          return;
        }

        dispatch(
          removeAnnotationById({
            annotationId: pendingAnnotationId,
            nextSelectedAnnotationId: null,
          })
        );
        dispatch(
          setPendingAnnotationIdByToolType({
            toolType,
            annotationId: null,
          })
        );
      },
      onNodeCreated: (coordinate, linkedNodeGroupId) => {
        const pendingAnnotationId = getPendingAnnotationIdForTool(
          getState().draftState,
          toolType
        );
        if (pendingAnnotationId) {
          dispatch(
            setPendingAnnotationIdByToolType({
              toolType,
              annotationId: null,
            })
          );
        }

        const labelCount = getState().annotationEntries.filter(
          (entry) => entry.toolType === toolType
        ).length;
        const createdMeasurement = createLabelMeasurement({
          toolType,
          coordinate,
          displayName: getDefaultLabelDisplayName(labelCount + 1),
          addAnnotation,
          linkedNodeGroupId,
        });

        dispatch(
          setPendingAnnotationIdByToolType({
            toolType,
            annotationId: createdMeasurement.id,
          })
        );
      },
    }),
  },
  pointQuery: {
    onPointCreated: ({
      coordinate,
      linkedNodeGroupId,
      activeToolSession,
    }) => {
      activeToolSession?.onNodeCreated?.(coordinate, linkedNodeGroupId);
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
      const { points, pointLabels } = buildLabelToolRenderModels({
        toolType,
        visuals: labelToolSettings.visuals,
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
