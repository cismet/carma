import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import {
  ANNOTATION_TYPES,
  defaultAnnotationAreaPalette,
  type AnnotationAreaPalette,
  type AnnotationGeographicCoordinate,
  type AnnotationToolId,
  type AnnotationTypes,
} from "@carma-mapping/annotations/core";

import { isValidAnnotationEngine } from "../engine";
import type {
  AnnotationPointQueryVisualStyle,
  AnnotationToolAuthoringContext,
  AnnotationToolAuthoringController,
  PointQueryPickResult,
} from "../registry";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "../render/annotation-render-models";
import { createAnnotationPolygonFillsController } from "../render/create-annotation-polygon-fills-controller";
import { createAnnotationOverlayPolygonFillsController } from "../render/create-annotation-overlay-polygon-fills-controller";
import {
  isCoplanarPolygonFillPlacement,
  resolveAreaOcclusionLineRenderOptions,
  resolveAreaOcclusionStyleOptions,
  resolveAreaOverlayFillColor,
  type AreaOcclusionStyleOptions,
} from "../config/area-occlusion-style-options";
import {
  resolveAnnotationLineStyleOptions,
  type AnnotationLineStyleOptions,
} from "../config/annotation-line-style-options";
import { annotationOverlayDefaults } from "../config/annotation-overlay-defaults";
import { AREA_EDGE_CROSSING_PROJECTION_MODES } from "./area-edge-crossing.helpers";
import {
  createAreaLabelController,
  resolveAreaLabelScreenState,
} from "./authoring-area-label";
import {
  createAnnotationOverlayLayer,
  destroyAnnotationOverlayLayer,
} from "./authoring-overlay-layer";
import { createHorizontalLinePreviewController } from "./create-horizontal-line-preview-controller";
import { createPathAuthoringController } from "./create-path-authoring-controller";
import { buildPolygonPreviewAreaLabel } from "./polygon-preview-area-label";
import {
  buildFillLoopPreviewCoordinates,
  resolvePolygonPreviewGeometry,
  type PolygonAuthoringMeasurementCoordinatesResolver,
} from "./polygon-preview-coordinates";
import { createProjectionNormalController } from "./projection-normal-controller";

export type {
  PolygonAuthoringMeasurementCoordinatesResolution,
  PolygonAuthoringMeasurementCoordinatesResolver,
} from "./polygon-preview-coordinates";

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const POLYGON_LOOP_OVERLAY_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";
const AREA_LABEL_OVERLAY_LAYER_ID =
  "annotation-overlay-area-preview-label-layer";
const { AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND } = ANNOTATION_TYPES;

export type PolygonAuthoringPointQueryVisualStyleResolver = (args: {
  pickResult: PointQueryPickResult | null;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
  currentPointQueryPickAcceptable: boolean;
}) => AnnotationPointQueryVisualStyle | undefined;

export const createPolygonAuthoringController = ({
  toolType,
  draftToolId,
  context,
  occlusionStyleOptions,
  areaPalette = defaultAnnotationAreaPalette,
  annotationLineStyleOptions,
  resolveMeasurementCoordinates,
  showInitialHorizontalLinePreview,
  initialHorizontalLinePreviewDiskColorCss,
  initialHorizontalLinePreviewDiskOpacity,
  initialHorizontalLinePreviewPlaneToleranceMeters,
  initialHorizontalLinePreviewMaxLengthMeters,
  resolvePointQueryVisualStyle,
}: {
  toolType: AnnotationTypes["AREA_GROUND"] | AnnotationTypes["AREA_PLANAR"];
  draftToolId?: AnnotationToolId;
  context: AnnotationToolAuthoringContext;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  /** Colours of the draft fill and guides; the host's palette when it has one. */
  areaPalette?: AnnotationAreaPalette;
  annotationLineStyleOptions?: AnnotationLineStyleOptions;
  resolveMeasurementCoordinates?: PolygonAuthoringMeasurementCoordinatesResolver;
  showInitialHorizontalLinePreview?: boolean;
  initialHorizontalLinePreviewDiskColorCss?: string;
  initialHorizontalLinePreviewDiskOpacity?: number | null;
  initialHorizontalLinePreviewPlaneToleranceMeters?: number | null;
  initialHorizontalLinePreviewMaxLengthMeters?: number | null;
  resolvePointQueryVisualStyle?: PolygonAuthoringPointQueryVisualStyleResolver;
}): AnnotationToolAuthoringController | null => {
  const { engine, drafts, formatOptions, lineLabelOptions } = context;
  if (!engine || engine.isDestroyed()) {
    return null;
  }
  const previewId = draftToolId ?? toolType;
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const previewFillPlacement =
    toolType === ANNOTATION_TYPE_AREA_GROUND
      ? RUNTIME_POLYGON_FILL_PLACEMENT.GROUND
      : RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR;
  const areaEdgeCrossingProjectionMode =
    toolType === ANNOTATION_TYPE_AREA_GROUND
      ? AREA_EDGE_CROSSING_PROJECTION_MODES.GROUND_GEODESIC
      : AREA_EDGE_CROSSING_PROJECTION_MODES.AREA_PLANE;
  const resolvedLineStyleOptions = resolveAnnotationLineStyleOptions(
    annotationLineStyleOptions
  );
  const previewLineOptions = {
    ...(resolveAreaOcclusionLineRenderOptions(resolvedOcclusionStyleOptions) ??
      {}),
    strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
    overlayDashPattern: resolvedLineStyleOptions.overlayDashPattern,
  };

  const draftChainController = createPathAuthoringController(engine, {
    overlayLayerId: DRAFT_CHAIN_OVERLAY_LAYER_ID,
    lineId: `${previewId}-draft-preview-chain`,
    lineColor: annotationOverlayDefaults.draftChainColor,
    showPointMarkers: true,
    lineOptions: previewLineOptions,
  });
  const polygonLoopController = createPathAuthoringController(engine, {
    overlayLayerId: POLYGON_LOOP_OVERLAY_LAYER_ID,
    lineId: `${previewId}-draft-preview-loop`,
    lineColor: annotationOverlayDefaults.draftChainColor,
    showPointMarkers: false,
    lineOptions: previewLineOptions,
  });
  const projectionNormalController = createProjectionNormalController({
    engine,
    idPrefix: `${previewId}-draft`,
    colorCss: areaPalette.cssColor(toolType, 0.9),
    strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
  });
  const initialHorizontalLinePreviewController =
    showInitialHorizontalLinePreview
      ? createHorizontalLinePreviewController(engine, {
          id: `${previewId}-initial-horizontal-line-preview-disc`,
          colorCss:
            initialHorizontalLinePreviewDiskColorCss ??
            areaPalette.cssColor(toolType, 1),
          opacity:
            typeof initialHorizontalLinePreviewDiskOpacity === "number"
              ? initialHorizontalLinePreviewDiskOpacity
              : 0.45,
          planePlacementToleranceMeters:
            initialHorizontalLinePreviewPlaneToleranceMeters,
          maxLengthMeters: initialHorizontalLinePreviewMaxLengthMeters,
        })
      : null;
  const previewFillController = createAnnotationPolygonFillsController(engine, {
    allowPicking: false,
  });
  const previewOverlayFillController =
    createAnnotationOverlayPolygonFillsController(
      engine,
      `${previewId}-draft-preview`
    );
  const areaLabelOverlayLayer = createAnnotationOverlayLayer(
    engine,
    `${AREA_LABEL_OVERLAY_LAYER_ID}-${previewId}`
  );
  const areaLabelController = createAreaLabelController({
    overlayLayer: areaLabelOverlayLayer,
    accentColor: areaPalette.cssColor(toolType, 1),
    visualOptions: lineLabelOptions,
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [...drafts.get(previewId).coordinates];
  let currentPointQueryPickAcceptable = true;

  const clearPreviewGeometry = () => {
    projectionNormalController.clear(false);
    previewFillController.clear(false);
    previewOverlayFillController.clear(false);
    areaLabelController.setState(null);
  };

  const render = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    if (!enabled || draftCoordinates.length === 0) {
      currentPointQueryPickAcceptable = true;
      draftChainController.clear(false);
      polygonLoopController.clear(false);
      initialHorizontalLinePreviewController?.clear(false);
      clearPreviewGeometry();
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const {
      lineCoordinates,
      markerCoordinates,
      fillCoordinateRings,
      hasLineCoordinates,
      hasFillCoordinates,
      pickAcceptable,
    } = resolvePolygonPreviewGeometry({
      draftCoordinates,
      hoverCoordinate,
      hoverInputModifier: pointQueryPickResult?.inputModifier,
      resolveMeasurementCoordinates,
      getPreferredFacingPositionECEF: () => engine.getCameraPositionECEF(),
      projectionMode: areaEdgeCrossingProjectionMode,
    });
    currentPointQueryPickAcceptable = pickAcceptable;

    if (initialHorizontalLinePreviewController) {
      if (
        draftCoordinates.length === 1 &&
        hoverCoordinate &&
        draftCoordinates[0]
      ) {
        initialHorizontalLinePreviewController.setState(
          {
            anchorECEF: ecefFromGeographicCoordinate(draftCoordinates[0]),
            targetECEF: ecefFromGeographicCoordinate(hoverCoordinate),
          },
          false
        );
      } else {
        initialHorizontalLinePreviewController.clear(false);
      }
    }

    draftChainController.setState(
      { lineCoordinates, markerCoordinates },
      false
    );
    polygonLoopController.setState(
      {
        lineCoordinates: hasFillCoordinates
          ? buildFillLoopPreviewCoordinates(fillCoordinateRings)
          : [],
        markerCoordinates: [],
      },
      false
    );

    if (!hasLineCoordinates || lineCoordinates.length < 3) {
      clearPreviewGeometry();
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    projectionNormalController.setSegments(
      lineCoordinates.flatMap((fromPlaneCoordinate, index) => {
        const toSampleCoordinate = markerCoordinates[index];
        return toSampleCoordinate
          ? [{ fromPlaneCoordinate, toSampleCoordinate }]
          : [];
      }),
      false
    );

    if (!hasFillCoordinates) {
      previewFillController.clear(false);
      previewOverlayFillController.clear(false);
      areaLabelController.setState(null);
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    const previewFill = areaPalette.fillCssColor(toolType, false);
    const previewPolygonFills = fillCoordinateRings
      .filter((coordinates) => coordinates.length >= 3)
      .map((coordinates, index) => ({
        id: `${previewId}-draft-preview-fill-${index}`,
        coordinates,
        fill: previewFill,
        ...(isCoplanarPolygonFillPlacement(previewFillPlacement) &&
        resolvedOcclusionStyleOptions.fill.overlay
          ? {
              overlayFill: resolveAreaOverlayFillColor(
                previewFill,
                resolvedOcclusionStyleOptions
              ),
            }
          : {}),
        placement: previewFillPlacement,
      }));
    previewFillController.setPolygonFills(previewPolygonFills, false);
    previewOverlayFillController.setPolygonFills(
      previewPolygonFills.filter((polygonFill) => polygonFill.overlayFill),
      false
    );
    areaLabelController.setState(
      resolveAreaLabelScreenState(
        engine,
        buildPolygonPreviewAreaLabel({
          toolType,
          coordinateRings: fillCoordinateRings,
          formatOptions,
        })
      )
    );
    if (requestRender) {
      engine.requestRender();
    }
  };

  const unsubscribe = drafts.subscribe(previewId, () => {
    const nextDraftCoordinates = drafts.get(previewId).coordinates;
    if (areCoordinateListsEqual(draftCoordinates, nextDraftCoordinates)) {
      return;
    }

    draftCoordinates = [...nextDraftCoordinates];
    render();
  });

  render();

  return {
    setEnabled: (nextEnabled) => {
      enabled = nextEnabled;
      if (!enabled) {
        pointQueryPickResult = null;
      }
      render();
    },
    setPointQueryPickResult: (pickResult, options) => {
      pointQueryPickResult = pickResult;
      render(options?.requestRender);
    },
    isPointQueryPickResultAcceptable: () => currentPointQueryPickAcceptable,
    ...(resolvePointQueryVisualStyle
      ? {
          getPointQueryVisualStyle: () =>
            resolvePointQueryVisualStyle({
              pickResult: pointQueryPickResult,
              previousCoordinates: draftCoordinates,
              currentPointQueryPickAcceptable,
            }),
        }
      : {}),
    destroy: () => {
      unsubscribe();
      draftChainController.destroy();
      polygonLoopController.destroy();
      projectionNormalController.destroy();
      initialHorizontalLinePreviewController?.destroy();
      previewFillController.destroy();
      previewOverlayFillController.destroy();
      areaLabelController.destroy();
      destroyAnnotationOverlayLayer(areaLabelOverlayLayer);
    },
  };
};
