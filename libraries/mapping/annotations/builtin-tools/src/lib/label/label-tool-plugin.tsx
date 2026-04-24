import { faMessage } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ANNOTATION_TYPES,
  resolveAnnotationLabelTextSuggestions,
} from "@carma-mapping/annotations/core";
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
import type {
  AnnotationNodeLinkId,
  AnnotationToolPlugin,
  CesiumGeographicCoordinate,
} from "@carma-mapping/annotations/runtime";
const { LABEL: ANNOTATION_TYPE_LABEL } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_LABEL;
const getLabelToolInfoBoxSlots = createLabelToolInfoBoxSlots(toolType);

export type LabelToolTextRequestContext = {
  coordinate: CesiumGeographicCoordinate;
  defaultText: string;
  labelTextSuggestions: readonly string[];
  linkedNodeGroupId?: AnnotationNodeLinkId | null;
};

export type LabelToolTextRequester = (
  context: LabelToolTextRequestContext
) => string | null | Promise<string | null>;

export type LabelToolPluginOptions = {
  requestLabelText?: LabelToolTextRequester;
};

export const createLabelToolPlugin = ({
  requestLabelText,
}: LabelToolPluginOptions = {}): AnnotationToolPlugin =>
  createMeasurementToolPlugin({
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
          const annotationEntries = getState().annotationEntries;
          const labelCount = annotationEntries.filter(
            (entry) => entry.toolType === toolType
          ).length;
          const defaultText = getDefaultLabelDisplayName(labelCount + 1);
          const labelTextSuggestions = resolveAnnotationLabelTextSuggestions({
            annotationEntries,
          });
          const addLabel = (text: string) => {
            createLabelMeasurement({
              toolType,
              coordinate,
              displayName: text.trim() || defaultText,
              addAnnotation,
              linkedNodeGroupId,
              sourceToolId: toolType,
            });
          };

          if (!requestLabelText) {
            addLabel(defaultText);
            return;
          }

          void Promise.resolve(
            requestLabelText({
              coordinate,
              defaultText,
              labelTextSuggestions,
              linkedNodeGroupId,
            })
          )
            .then((text) => {
              if (text === null) {
                return;
              }
              addLabel(text);
            })
            .catch((error) => {
              console.error(
                "[annotations][label] Failed to request label text",
                error
              );
            });
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

export const labelToolPlugin = createLabelToolPlugin();
