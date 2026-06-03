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
  resolveAreaPlanarTrapezoidDraftCoordinates,
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
  texts = defaultAnnotationToolTexts,
}: AreaPlanarToolPluginOptions & AreaPlanarToolVariantConfig) => {
  const text = texts.areaPlanar;
  const isTrapezoidInputMode = inputMode === AREA_PLANAR_INPUT_MODES.TRAPEZOID;
  const resolveDraftInputCoordinates = (
    coordinates: readonly CesiumGeographicCoordinate[]
  ) =>
    isTrapezoidInputMode
      ? resolveAreaPlanarTrapezoidDraftCoordinates(coordinates)
      : coordinates;
  const resolveMeasurementInputCoordinates = (
    coordinates: readonly CesiumGeographicCoordinate[]
  ) =>
    isTrapezoidInputMode
      ? resolveAreaPlanarTrapezoidMeasurementCoordinates(coordinates)
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
      createSession: ({ drafts, setActiveToolType, addAnnotation }) => ({
        toolType: toolId,
        requestStart: () => {
          setActiveToolType(toolId);
        },
        requestFinish: () => {
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
        },
        discardDraft: () => {
          drafts.clear(toolId);
        },
        onNodeCreated: (coordinate, linkedNodeGroupId) => {
          const currentDraft = drafts.get(toolId);
          const nextCoordinates = isTrapezoidInputMode
            ? resolveNextAreaPlanarTrapezoidDraftCoordinates({
                coordinate,
                previousCoordinates: currentDraft.coordinates,
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
        },
        finishesOnLoopClosure: true,
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
          resolveMeasurementCoordinates: ({
            coordinates,
            previousCoordinates,
            preferredFacingPositionECEF,
          }) => {
            const measurementInputCoordinates =
              resolveMeasurementInputCoordinates(
                resolveDraftInputCoordinates(coordinates)
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
      "Ersten Punkt frei setzen, zweiten Punkt auf der langen horizontalen Kante setzen.",
      "Der zweite Punkt wird auf die Höhe des ersten Punkts gezwungen. Ab dem dritten Punkt wird die parallele Trapezkante als Hilfskontur konstruiert.",
      "Ein vierter Punkt kann die parallele Gegenkante für unsymmetrische Trapeze festlegen.",
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
