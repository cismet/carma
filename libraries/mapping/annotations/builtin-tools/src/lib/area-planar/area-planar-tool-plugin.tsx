import { VectorTrapezoidIcon } from "@carma-commons/ui/components";
import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  formatMeasurementShortLabelToken,
  resolveAnnotationCommonShortcutAction,
  ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID,
  ANNOTATION_AREA_PLANAR_PCA_TOOL_ID,
  ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID,
  ANNOTATION_TYPES,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import { createPolygonAuthoringController } from "@carma-mapping/annotations/runtime";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "@carma-mapping/annotations/runtime";
import { ANNOTATION_TOOL_PLUGIN_CAPABILITIES } from "@carma-mapping/annotations/runtime";
import {
  AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
  createMeasurementToolPlugin,
  resolveAreaOcclusionStyleOptions,
  type AreaOcclusionStyleOptions,
  type MeasurementLineStyleOptions,
} from "@carma-mapping/annotations/runtime";
import type {
  AnnotationToolDraftState,
  CesiumGeographicCoordinate,
} from "@carma-mapping/annotations/runtime";
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
import { formatCardinalBearing } from "@carma-mapping/annotations/runtime";
import type { DefaultAnnotationToolTexts } from "../annotation-mode-text";
import { defaultAnnotationToolTexts } from "../annotation-mode-text";
import {
  AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
  AREA_PLANAR_PROJECTION_MODES,
  canResolveAreaPlanarProjectedPolygon,
  resolveAreaPlanarProjectedCoordinates,
  type AreaPlanarProjectionMode,
} from "./area-planar-projection";
import {
  AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS,
  AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS,
  AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG,
  canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane,
  canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength,
  resolveAreaPlanarTrapezoidDraftCoordinates,
  resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters,
  resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters,
  resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg,
  resolveAreaPlanarTrapezoidMeasurementCoordinates,
  resolveNextAreaPlanarTrapezoidDraftCoordinates,
} from "./area-planar-trapezoid";
const { AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR } = ANNOTATION_TYPES;

const toolType = ANNOTATION_TYPE_AREA_PLANAR;
const labelTheme = ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME;

const AREA_PLANAR_OCCLUSION_STYLE_DEFAULTS = resolveAreaOcclusionStyleOptions({
  fill: {
    overlay: false,
  },
  line: {
    overlayDashed: true,
  },
});
const AREA_PLANAR_REJECTED_POINT_FEEDBACK =
  "Der letzte Punkt wurde nicht übernommen: Die projizierte Kontur würde sich selbst schneiden oder die Ebene zu stark kippen.";
const AREA_PLANAR_TRAPEZOID_HORIZONTAL_PLANE_REJECTED_POINT_FEEDBACK =
  "Der letzte Punkt wurde nicht übernommen: Der zweite Punkt liegt zu weit von der horizontalen Hilfsebene entfernt.";
const AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_TOO_LONG_FEEDBACK =
  "Der letzte Punkt wurde nicht übernommen: Die horizontale Hilfslinie ist zu lang für die lokale Tangentenebene. Für längere Strecken bitte eine geodätische Linienmessung verwenden.";
const AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_PREVIEW_DISK_COLOR_CSS =
  "#00d9ff";
const AREA_PLANAR_INPUT_MODES = {
  PROJECTED_POLYGON: "projected-polygon",
  TRAPEZOID: "trapezoid",
} as const;

type AreaPlanarInputMode =
  (typeof AREA_PLANAR_INPUT_MODES)[keyof typeof AREA_PLANAR_INPUT_MODES];

const resolveAreaPlanarOcclusionStyleOptions = (
  occlusionStyleOptions?: AreaOcclusionStyleOptions
) => {
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions,
    AREA_PLANAR_OCCLUSION_STYLE_DEFAULTS
  );

  return {
    ...resolvedOcclusionStyleOptions,
    fill: {
      ...resolvedOcclusionStyleOptions.fill,
      overlay: false,
    },
  };
};

export type AreaPlanarToolPluginOptions = {
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  measurementLineStyleOptions?: MeasurementLineStyleOptions;
  maxPlaneNormalChangeDeg?: number | null;
  trapezoidHorizontalPlaneToleranceMeters?: number | null;
  trapezoidHorizontalLineMaxLengthMeters?: number | null;
  trapezoidThirdPointRightAngleToleranceDeg?: number | null;
  trapezoidHorizontalLinePreviewDiskColorCss?: string;
  trapezoidHorizontalLinePreviewDiskOpacity?: number | null;
  texts?: DefaultAnnotationToolTexts;
};

type AreaPlanarToolVariantConfig = {
  toolId: AnnotationToolId;
  order: number;
  label: string;
  tooltip: string;
  helpText: readonly string[];
  projectionMode: AreaPlanarProjectionMode;
  inputMode?: AreaPlanarInputMode;
  iconLabel?: string;
  shortcutKey?: string;
  renderStoredPlanarAnnotations?: boolean;
  exposeInfoBox?: boolean;
};

const createAreaPlanarToolIcon = (iconLabel?: string) => (
  <span
    style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
    }}
  >
    {iconLabel ? (
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "max-content",
          fontSize: "1.34em",
          fontWeight: 700,
          lineHeight: 1,
          textAlign: "center",
          color: "#ffffff",
          WebkitTextStroke: "1px #000000",
          paintOrder: "stroke fill",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {iconLabel}
      </span>
    ) : null}
    <span
      style={{
        position: "relative",
        zIndex: 1,
        display: "inline-flex",
      }}
    >
      <VectorTrapezoidIcon fontSize="1.33em" />
    </span>
  </span>
);

const createAreaPlanarToolVariantPlugin = ({
  toolId,
  order,
  label,
  tooltip,
  shortcutKey,
  helpText,
  projectionMode,
  inputMode = AREA_PLANAR_INPUT_MODES.PROJECTED_POLYGON,
  iconLabel,
  renderStoredPlanarAnnotations = false,
  exposeInfoBox = false,
  occlusionStyleOptions,
  measurementLineStyleOptions,
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
  const resolvedTrapezoidHorizontalPlaneToleranceMeters =
    resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters(
      trapezoidHorizontalPlaneToleranceMeters
    );
  const resolvedTrapezoidHorizontalLineMaxLengthMeters =
    resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters(
      trapezoidHorizontalLineMaxLengthMeters
    );
  const resolvedTrapezoidThirdPointRightAngleToleranceDeg =
    resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg(
      trapezoidThirdPointRightAngleToleranceDeg
    );
  const resolveDraftInputCoordinates = (
    coordinates: readonly CesiumGeographicCoordinate[],
    options: {
      applyThirdPointRightAngleLimiter?: boolean;
      forceAccepted?: boolean;
    } = {}
  ) =>
    isTrapezoidInputMode
      ? resolveAreaPlanarTrapezoidDraftCoordinates(coordinates, {
          thirdPointRightAngleToleranceDeg:
            resolvedTrapezoidThirdPointRightAngleToleranceDeg,
          applyThirdPointRightAngleLimiter:
            options.applyThirdPointRightAngleLimiter,
          forceAccepted: options.forceAccepted,
        })
      : coordinates;
  const resolveMeasurementInputCoordinates = (
    coordinates: readonly CesiumGeographicCoordinate[],
    options: {
      applyThirdPointRightAngleLimiter?: boolean;
      forceAccepted?: boolean;
    } = {}
  ) =>
    isTrapezoidInputMode
      ? resolveAreaPlanarTrapezoidMeasurementCoordinates(coordinates, {
          thirdPointRightAngleToleranceDeg:
            resolvedTrapezoidThirdPointRightAngleToleranceDeg,
          applyThirdPointRightAngleLimiter:
            options.applyThirdPointRightAngleLimiter,
          forceAccepted: options.forceAccepted,
        })
      : coordinates;
  const getAreaPlanarToolInfoBoxSlots = createNodeChainAreaToolInfoBoxSlots(
    toolType,
    {
      headingTitle: text.headingTitle,
      headingColor: labelTheme.scheme.colorPrimary,
      formatMeasurementLabelToken: (counter) =>
        formatMeasurementShortLabelToken(toolType, counter),
      actionLabels: texts.actions,
      navigationLabels: texts.navigation,
      metricLabels: text.metricLabels,
      formatBearing: (bearingRad) => formatCardinalBearing(bearingRad),
    }
  );
  const resolvedOcclusionStyleOptions =
    resolveAreaPlanarOcclusionStyleOptions(occlusionStyleOptions);
  const areaPlanarToolVisuals = createNodeChainAreaToolVisuals({
    fillType: toolType,
    measurementLineStyleOptions,
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
    capabilities: [
      ...AUTHORING_MEASUREMENT_PLUGIN_CAPABILITIES,
      ANNOTATION_TOOL_PLUGIN_CAPABILITIES.ADD_ANNOTATION,
      ...(exposeInfoBox ? [ANNOTATION_TOOL_PLUGIN_CAPABILITIES.INFO_BOX] : []),
    ],
    session: {
      createSession: ({ drafts, setActiveToolType, addAnnotation }) => {
        const requestFinish = () => {
          const draft = drafts.get(toolId);
          const measurementInputCoordinates = resolveMeasurementInputCoordinates(
            draft.coordinates
          );
          const projectedCoordinates = resolveAreaPlanarProjectedCoordinates({
            coordinates: measurementInputCoordinates,
            mode: projectionMode,
          });
          const nextMeasurement = commitAreaMeasurement({
            toolType,
            coordinates: projectedCoordinates ?? [],
            addAnnotation,
            sourceToolId: toolId,
          });

          drafts.clear(toolId);
          return Boolean(nextMeasurement);
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
          onNodeCreated: (coordinate, linkedNodeGroupId, forceAccepted) => {
            const currentDraft = drafts.get(toolId);
            const isFourthTrapezoidPoint =
              isTrapezoidInputMode && currentDraft.coordinates.length === 3;
            if (
              isTrapezoidInputMode &&
              !forceAccepted &&
              !canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength(
                {
                  coordinate,
                  previousCoordinates: currentDraft.coordinates,
                  maxLengthMeters:
                    resolvedTrapezoidHorizontalLineMaxLengthMeters,
                }
              )
            ) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message:
                    AREA_PLANAR_TRAPEZOID_HORIZONTAL_LINE_TOO_LONG_FEEDBACK,
                },
              });
              return;
            }
            if (
              isTrapezoidInputMode &&
              !forceAccepted &&
              !canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
                coordinate,
                previousCoordinates: currentDraft.coordinates,
                toleranceMeters: resolvedTrapezoidHorizontalPlaneToleranceMeters,
              })
            ) {
              drafts.set(toolId, {
                ...currentDraft,
                feedback: {
                  kind: "warning",
                  message:
                    AREA_PLANAR_TRAPEZOID_HORIZONTAL_PLANE_REJECTED_POINT_FEEDBACK,
                },
              });
              return;
            }
            const nextCoordinates = isTrapezoidInputMode
              ? resolveNextAreaPlanarTrapezoidDraftCoordinates({
                  coordinate,
                  previousCoordinates: currentDraft.coordinates,
                  thirdPointRightAngleToleranceDeg:
                    resolvedTrapezoidThirdPointRightAngleToleranceDeg,
                  forceAccepted,
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
              resolveMeasurementInputCoordinates(nextCoordinates, {
                forceAccepted,
              });
            const previousMeasurementInputCoordinates =
              resolveMeasurementInputCoordinates(currentDraft.coordinates);
            if (
              !canResolveAreaPlanarProjectedPolygon({
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
      onPointCreated: ({
        coordinate,
        linkedNodeGroupId,
        activeToolSession,
        forceAccepted,
      }) => {
        activeToolSession?.onNodeCreated?.(
          coordinate,
          linkedNodeGroupId,
          forceAccepted
        );
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
          measurementLineStyleOptions,
          showInitialHorizontalLinePreview: isTrapezoidInputMode,
          initialHorizontalLinePreviewDiskColorCss:
            trapezoidHorizontalLinePreviewDiskColorCss,
          initialHorizontalLinePreviewDiskOpacity:
            trapezoidHorizontalLinePreviewDiskOpacity,
          initialHorizontalLinePreviewPlaneToleranceMeters:
            resolvedTrapezoidHorizontalPlaneToleranceMeters,
          initialHorizontalLinePreviewMaxLengthMeters:
            resolvedTrapezoidHorizontalLineMaxLengthMeters,
          resolveMeasurementCoordinates: ({
            coordinates,
            previousCoordinates,
            preferredFacingPositionECEF,
            forceAccepted,
          }) => {
            if (
              isTrapezoidInputMode &&
              !forceAccepted &&
              coordinates.length === 2 &&
              previousCoordinates?.length === 1 &&
              !canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength(
                {
                  coordinate: coordinates[1]!,
                  previousCoordinates,
                  maxLengthMeters:
                    resolvedTrapezoidHorizontalLineMaxLengthMeters,
                }
              )
            ) {
              return null;
            }
            if (
              isTrapezoidInputMode &&
              !forceAccepted &&
              coordinates.length === 2 &&
              previousCoordinates?.length === 1 &&
              !canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
                coordinate: coordinates[1]!,
                previousCoordinates,
                toleranceMeters: resolvedTrapezoidHorizontalPlaneToleranceMeters,
              })
            ) {
              return null;
            }
            const applyThirdPointRightAngleLimiter =
              isTrapezoidInputMode &&
              coordinates.length === 3 &&
              previousCoordinates?.length === 2;
            const measurementInputCoordinates =
              resolveMeasurementInputCoordinates(
                resolveDraftInputCoordinates(coordinates, {
                  applyThirdPointRightAngleLimiter,
                  forceAccepted,
                }),
                { applyThirdPointRightAngleLimiter, forceAccepted }
              );
            const previousMeasurementInputCoordinates = previousCoordinates
              ? resolveMeasurementInputCoordinates(previousCoordinates)
              : previousCoordinates;
            if (measurementInputCoordinates.length < 3) {
              return measurementInputCoordinates;
            }

            return canResolveAreaPlanarProjectedPolygon({
              coordinates: measurementInputCoordinates,
              mode: projectionMode,
              previousCoordinates: previousMeasurementInputCoordinates,
              preferredFacingPositionECEF,
              maxPlaneNormalChangeDeg,
            })
              ? resolveAreaPlanarProjectedCoordinates({
                  coordinates: measurementInputCoordinates,
                  mode: projectionMode,
                  preferredFacingPositionECEF,
                })
              : null;
          },
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
          const currentDraft = sessionContext.drafts.get(toolId);
          if (currentDraft.coordinates.length === 0) {
            return false;
          }

          sessionContext.drafts.set(toolId, {
            coordinates: undoAreaPreviewPoint(currentDraft.coordinates),
            linkedNodeGroupIds: undoAreaPreviewPoint(
              currentDraft.linkedNodeGroupIds
            ),
            feedback: null,
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
        onNodeLongPress,
      }) => {
        if (!renderStoredPlanarAnnotations) {
          return null;
        }

        return buildNodeChainAreaToolRenderModels({
          toolType,
          visuals: areaPlanarToolVisuals,
          nodes,
          measurements: annotationEntries,
          selectedMeasurementIds: selectedAnnotationIds,
          fillPlacement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
          formatOptions,
          onMeasurementSelect: setSelectedAnnotationId,
          onNodeLongPress,
          occlusionStyleOptions: resolvedOcclusionStyleOptions,
        });
      },
    },
    ...(exposeInfoBox
      ? {
          infoBox: {
            getSlots: getAreaPlanarToolInfoBoxSlots,
          },
        }
      : {}),
  });
};

export const createAreaPlanarToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) => {
  const text = options.texts?.areaPlanar ?? defaultAnnotationToolTexts.areaPlanar;
  return createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: toolType,
    order: 55,
    label: text.label,
    tooltip: text.tooltip,
    shortcutKey: "C",
    helpText: text.helpText,
    projectionMode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
    renderStoredPlanarAnnotations: true,
    exposeInfoBox: true,
  });
};

export const createAreaPlanarBiggestTriangleToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) =>
  createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: ANNOTATION_AREA_PLANAR_BIGGEST_TRIANGLE_TOOL_ID,
    order: 56,
    label: "Dach 3Eck",
    tooltip: "Dachfläche aus dem größten 3-Punkt-Dreieck messen",
    iconLabel: "3Eck",
    helpText: [
      "Punkte auf der Dachfläche setzen. Die Ebene wird aus dem größten Dreieck der Eingabepunkte bestimmt.",
      "Die Messkontur wird als Hilfspolygon auf diese Ebene projiziert.",
    ],
    projectionMode: AREA_PLANAR_PROJECTION_MODES.BIGGEST_TRIANGLE,
  });

export const createAreaPlanarPcaToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) =>
  createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: ANNOTATION_AREA_PLANAR_PCA_TOOL_ID,
    order: 57,
    label: "Dach PCA",
    tooltip: "Dachfläche aus einer PCA-Ausgleichsebene messen",
    iconLabel: "PCA",
    helpText: [
      "Punkte auf der Dachfläche setzen. Die Ebene wird als PCA-Ausgleichsebene der Eingabepunkte bestimmt.",
      "Die Messkontur wird als Hilfspolygon auf diese Ebene projiziert.",
    ],
    projectionMode: AREA_PLANAR_PROJECTION_MODES.PCA,
  });

export const createAreaPlanarTrapezoidToolPlugin = (
  options: AreaPlanarToolPluginOptions = {}
) =>
  createAreaPlanarToolVariantPlugin({
    ...options,
    toolId: ANNOTATION_AREA_PLANAR_TRAPEZOID_TOOL_ID,
    order: 58,
    label: "Dach TR",
    tooltip: "Dachfläche mit Trapez-Konstruktion messen",
    iconLabel: "TR",
    helpText: [
      "Bevorzugt die längste horizontale Dachkante suchen und dort auf eine Ecke mit rechtem Winkel klicken.",
      "Den zweiten Punkt auf derselben Dachkante setzen. Er wird auf die Höhe des ersten Punkts gezwungen und definiert die horizontale Basiskante.",
      "Den dritten Punkt auf die parallele Gegenkante setzen. Bei einfachen Trapezen reicht das bereits als Hilfskonstruktion.",
      "Optional einen vierten Punkt setzen, wenn die Gegenkante unsymmetrisch ist oder die automatische Trapezform nicht passt.",
    ],
    projectionMode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
    inputMode: AREA_PLANAR_INPUT_MODES.TRAPEZOID,
  });

export const areaPlanarToolPlugin = createAreaPlanarToolPlugin();
export const areaPlanarBiggestTriangleToolPlugin =
  createAreaPlanarBiggestTriangleToolPlugin();
export const areaPlanarPcaToolPlugin = createAreaPlanarPcaToolPlugin();
export const areaPlanarTrapezoidToolPlugin =
  createAreaPlanarTrapezoidToolPlugin();
