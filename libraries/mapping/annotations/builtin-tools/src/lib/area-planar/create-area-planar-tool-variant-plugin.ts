import {
  formatMeasurementShortLabelToken,
  type AnnotationGeographicCoordinate,
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
} from "@carma-mapping/annotations/core";
import {
  createPolygonAuthoringController,
  ANNOTATION_TOOL_PLUGIN_CAPABILITIES,
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
  type AnnotationToolDraftState,
  formatCardinalBearing,
} from "@carma-mapping/annotations/runtime";
import {
  appendAreaPreviewPoint,
  commitAreaMeasurement,
} from "../area-shared/node-chain-area-tool-actions";
import { resolveAreaToolAddAnnotationOptions } from "../area-shared/resolve-area-tool-add-annotation-options";
import { createNodeChainAreaToolInfoBoxSlots } from "../area-shared/node-chain-area-tool-info-box-slots";
import { createNodeChainAreaToolVisuals } from "../area-shared/node-chain-area-tool-render-models";
import { defaultAnnotationToolTexts } from "../annotation-mode-text";
import {
  AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
  canAppendAreaPlanarProjectedPoint,
  resolveAreaPlanarProjectedAppendPreview,
  resolveAreaPlanarProjectedCoordinates,
} from "./area-planar-projection";
import {
  AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS,
  AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS,
  AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG,
  resolveAreaPlanarTrapezoidMeasurementCoordinates,
  resolveNextAreaPlanarTrapezoidDraftCoordinates,
} from "./area-planar-trapezoid";
import {
  toolType,
  labelTheme,
  isShiftInputModifier,
  AREA_PLANAR_REJECTED_POINT_FEEDBACK,
  AREA_PLANAR_REJECTED_FINISH_FEEDBACK,
  AREA_PLANAR_INPUT_MODES,
  resolveAreaPlanarOcclusionStyleOptions,
  type AreaPlanarToolPluginOptions,
  type AreaPlanarToolVariantConfig,
} from "./area-planar-tool-config";
import { AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_PREVIEW_DISK_COLOR_CSS } from "./area-planar-tool-help";
import { createAreaPlanarToolIcon } from "./area-planar-tool-icon";
import {
  createAreaPlanarToolKeyboard,
  createAreaPlanarToolVisualModels,
  isAreaPlanarTrapezoidSecondPointWithinLimits,
  resolveAreaPlanarTrapezoidLimits,
  resolveAreaPlanarTrapezoidPointRejection,
  resolveAreaPlanarTrapezoidSampleStyle,
} from "./area-planar-tool-plugin-behavior";

export const createAreaPlanarToolVariantPlugin = ({
  toolId,
  order,
  label,
  tooltip,
  shortcutKey,
  helpText,
  resolveHelpText,
  alwaysShowHelpTextWhileActive,
  projectionMode,
  inputMode = AREA_PLANAR_INPUT_MODES.PROJECTED_POLYGON,
  iconLabel,
  renderStoredPlanarAnnotations = false,
  exposeInfoBox = false,
  occlusionStyleOptions,
  areaPalette,
  annotationLineStyleOptions,
  areaLabelPills = false,
  maxPlaneNormalChangeDeg = AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
  trapezoidHorizontalPlaneToleranceMeters = AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS,
  trapezoidHorizontalLineMaxLengthMeters = AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS,
  trapezoidThirdPointRightAngleToleranceDeg = AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG,
  trapezoidHorizontalLinePreviewDiskColorCss = AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_PREVIEW_DISK_COLOR_CSS,
  trapezoidHorizontalLinePreviewDiskOpacity = 0.45,
  texts = defaultAnnotationToolTexts,
}: AreaPlanarToolPluginOptions & AreaPlanarToolVariantConfig) => {
  const text = texts.areaPlanar;
  const isTrapezoidInputMode = inputMode === AREA_PLANAR_INPUT_MODES.TRAPEZOID;
  const trapezoidLimits = resolveAreaPlanarTrapezoidLimits({
    horizontalPlaneToleranceMeters: trapezoidHorizontalPlaneToleranceMeters,
    horizontalLineMaxLengthMeters: trapezoidHorizontalLineMaxLengthMeters,
    thirdPointRightAngleToleranceDeg: trapezoidThirdPointRightAngleToleranceDeg,
  });
  const resolveMeasurementInputCoordinates = (
    coordinates: readonly AnnotationGeographicCoordinate[]
  ) =>
    isTrapezoidInputMode
      ? resolveAreaPlanarTrapezoidMeasurementCoordinates(coordinates)
      : coordinates;
  const getAreaPlanarToolInfoBoxSlots = createNodeChainAreaToolInfoBoxSlots(
    toolType,
    {
      headingTitle: text.headingTitle,
      headingColor: labelTheme.scheme.colorPrimary,
      formatLabelToken: (counter) =>
        formatMeasurementShortLabelToken(toolType, counter),
      actionLabels: texts.actions,
      navigationLabels: texts.navigation,
      metricLabels: text.metricLabels,
      formatBearing: (bearingRad) => formatCardinalBearing(bearingRad),
    }
  );
  const resolvedOcclusionStyleOptions = resolveAreaPlanarOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const areaPlanarToolVisuals = createNodeChainAreaToolVisuals({
    fillType: toolType,
    areaPalette,
    annotationLineStyleOptions,
    areaLabelPills,
  });

  return createMeasurementToolPlugin({
    id: toolId,
    annotationType: toolType,
    descriptor: {
      id: toolId,
      order,
      label,
      tooltip,
      shortcutKey,
      icon: createAreaPlanarToolIcon(iconLabel),
    },
    helpText,
    resolveHelpText,
    alwaysShowHelpTextWhileActive,
    capabilities: [
      ...AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
      ANNOTATION_TOOL_PLUGIN_CAPABILITIES.ADD_ANNOTATION,
      ...(exposeInfoBox ? [ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX] : []),
    ],
    session: {
      createSession: ({ drafts, setActiveToolType, addAnnotation }) => {
        const requestFinish = () => {
          const draft = drafts.get(toolId);
          if (isTrapezoidInputMode && draft.coordinates.length < 3) {
            return false;
          }

          const measurementInputCoordinates =
            resolveMeasurementInputCoordinates(draft.coordinates);
          const projectedCoordinates = resolveAreaPlanarProjectedCoordinates({
            coordinates: measurementInputCoordinates,
            mode: projectionMode,
          });
          if (!projectedCoordinates) {
            drafts.set(toolId, {
              ...draft,
              feedback: {
                kind: "warning",
                message: AREA_PLANAR_REJECTED_FINISH_FEEDBACK,
              },
            });
            return false;
          }

          const nextMeasurement = commitAreaMeasurement({
            toolType,
            coordinates: projectedCoordinates,
            addAnnotation,
            sourceToolId: toolId,
          });

          if (!nextMeasurement) {
            return false;
          }

          drafts.clear(toolId);
          return true;
        };

        return {
          toolType: toolId,
          requestStart: () => {
            setActiveToolType(toolId);
          },
          requestFinish,
          discardDraft: () => {
            drafts.clear(toolId);
          },
          onNodeCreated: (coordinate, linkedNodeGroupId, options) => {
            const currentDraft = drafts.get(toolId);
            const limitersSuspended =
              isTrapezoidInputMode &&
              isShiftInputModifier(options?.inputModifier);
            const isFourthTrapezoidPoint =
              isTrapezoidInputMode && currentDraft.coordinates.length === 3;
            const trapezoidRejection = isTrapezoidInputMode
              ? resolveAreaPlanarTrapezoidPointRejection({
                  coordinate,
                  previousCoordinates: currentDraft.coordinates,
                  limits: trapezoidLimits,
                  limitersSuspended,
                })
              : null;
            if (trapezoidRejection) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: { kind: "warning", message: trapezoidRejection },
              });
              return;
            }
            const nextCoordinates = isTrapezoidInputMode
              ? resolveNextAreaPlanarTrapezoidDraftCoordinates({
                  coordinate,
                  previousCoordinates: currentDraft.coordinates,
                  thirdPointRightAngleToleranceDeg:
                    trapezoidLimits.thirdPointRightAngleToleranceDeg,
                  limitersSuspended,
                })
              : appendAreaPreviewPoint(currentDraft.coordinates, coordinate);
            if (!nextCoordinates) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message: AREA_PLANAR_REJECTED_POINT_FEEDBACK,
                },
              });
              return;
            }
            const nextMeasurementInputCoordinates =
              resolveMeasurementInputCoordinates(nextCoordinates);
            const previousMeasurementInputCoordinates =
              resolveMeasurementInputCoordinates(currentDraft.coordinates);
            if (
              !canAppendAreaPlanarProjectedPoint({
                coordinates: nextMeasurementInputCoordinates,
                mode: projectionMode,
                previousCoordinates: previousMeasurementInputCoordinates,
                maxPlaneNormalChangeDeg,
              })
            ) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message: AREA_PLANAR_REJECTED_POINT_FEEDBACK,
                },
              });
              return;
            }

            const nextDraft: AnnotationToolDraftState = {
              coordinates: nextCoordinates,
              linkedNodeGroupIds: appendAreaPreviewPoint(
                currentDraft.linkedNodeGroupIds,
                linkedNodeGroupId ?? null
              ),
              feedback: null,
            };
            drafts.set(toolId, nextDraft);
            if (isFourthTrapezoidPoint) {
              requestFinish();
            }
          },
          finishesOnLoopClosure: true,
        };
      },
    },
    pointQuery: {
      ...(isTrapezoidInputMode
        ? {
            inputModifiers: [
              ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT,
            ],
          }
        : {}),
      onPointCreated: ({
        coordinate,
        linkedNodeGroupId,
        activeToolSession,
        inputModifier,
      }) => {
        activeToolSession?.onNodeCreated?.(coordinate, linkedNodeGroupId, {
          inputModifier,
        });
      },
    },
    addAnnotation: {
      resolveOptions: resolveAreaToolAddAnnotationOptions,
    },
    authoringVisuals: {
      createController: (context) =>
        createPolygonAuthoringController({
          toolType,
          draftToolId: toolId,
          context,
          occlusionStyleOptions: resolvedOcclusionStyleOptions,
          areaPalette,
          annotationLineStyleOptions,
          showInitialHorizontalLinePreview: isTrapezoidInputMode,
          initialHorizontalLinePreviewDiskColorCss:
            trapezoidHorizontalLinePreviewDiskColorCss,
          initialHorizontalLinePreviewDiskOpacity:
            trapezoidHorizontalLinePreviewDiskOpacity,
          initialHorizontalLinePreviewPlaneToleranceMeters:
            trapezoidLimits.horizontalPlaneToleranceMeters,
          initialHorizontalLinePreviewMaxLengthMeters:
            trapezoidLimits.horizontalLineMaxLengthMeters,
          resolvePointQueryVisualStyle: ({
            pickResult,
            previousCoordinates,
            currentPointQueryPickAcceptable,
          }) => {
            const coordinate = pickResult?.coordinate ?? null;
            const limitersSuspended =
              isTrapezoidInputMode &&
              isShiftInputModifier(pickResult?.inputModifier);
            if (
              !isTrapezoidInputMode ||
              limitersSuspended ||
              !coordinate ||
              !currentPointQueryPickAcceptable
            ) {
              return undefined;
            }

            return resolveAreaPlanarTrapezoidSampleStyle({
              coordinate,
              previousCoordinates,
              limits: trapezoidLimits,
            });
          },
          resolveMeasurementCoordinates: ({
            coordinates,
            previousCoordinates,
            preferredFacingPositionECEF,
            inputModifier,
          }) => {
            const limitersSuspended =
              isTrapezoidInputMode && isShiftInputModifier(inputModifier);
            if (
              isTrapezoidInputMode &&
              !limitersSuspended &&
              coordinates.length === 2 &&
              previousCoordinates?.length === 1 &&
              !isAreaPlanarTrapezoidSecondPointWithinLimits({
                coordinate: coordinates[1]!,
                previousCoordinates,
                limits: trapezoidLimits,
              })
            ) {
              return null;
            }
            const nextTrapezoidCandidateCoordinates =
              isTrapezoidInputMode &&
              previousCoordinates &&
              coordinates.length === previousCoordinates.length + 1
                ? resolveNextAreaPlanarTrapezoidDraftCoordinates({
                    coordinate: coordinates[coordinates.length - 1]!,
                    previousCoordinates,
                    thirdPointRightAngleToleranceDeg:
                      trapezoidLimits.thirdPointRightAngleToleranceDeg,
                    limitersSuspended,
                  })
                : coordinates;
            if (!nextTrapezoidCandidateCoordinates) {
              return null;
            }
            const measurementInputCoordinates =
              resolveMeasurementInputCoordinates(
                nextTrapezoidCandidateCoordinates
              );
            const previousMeasurementInputCoordinates = previousCoordinates
              ? resolveMeasurementInputCoordinates(previousCoordinates)
              : previousCoordinates;
            if (measurementInputCoordinates.length < 3) {
              return measurementInputCoordinates;
            }

            const projectedCoordinates = resolveAreaPlanarProjectedCoordinates({
              coordinates: measurementInputCoordinates,
              mode: projectionMode,
              preferredFacingPositionECEF,
            });
            if (projectedCoordinates) {
              return projectedCoordinates;
            }

            return resolveAreaPlanarProjectedAppendPreview({
              coordinates: measurementInputCoordinates,
              mode: projectionMode,
              previousCoordinates: previousMeasurementInputCoordinates,
              preferredFacingPositionECEF,
              maxPlaneNormalChangeDeg,
            });
          },
        }),
    },
    keyboard: createAreaPlanarToolKeyboard({ toolId }),
    visualModels: createAreaPlanarToolVisualModels({
      renderStoredPlanarAnnotations,
      areaPlanarToolVisuals,
      resolvedOcclusionStyleOptions,
    }),
    ...(exposeInfoBox
      ? {
          infoBox: {
            getSlots: getAreaPlanarToolInfoBoxSlots,
          },
        }
      : {}),
  });
};
