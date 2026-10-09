import type {
  AnnotationPointQueryVisualStyle,
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry";
import { Vector3 } from "three";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  ecefFromGeographicCoordinate,
  getAnnotationAreaCssColor,
  getAnnotationAreaFillCssColor,
  type AnnotationGeographicCoordinate,
  type NodeChainAnnotation,
  type AnnotationToolId,
  type AnnotationTypes,
} from "@carma-mapping/annotations/core";
import {
  formatAreaSquareMetersAdaptive,
  type CssPixelPosition,
} from "@carma-units";
import { isValidAnnotationEngine } from "../engine";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import {
  applyLineRuntime,
  clearLineRuntime,
  createAreaLabelController,
  createLineCollection,
  createLineRuntime,
  createAnnotationOverlayLayer,
  destroyAnnotationOverlayLayer,
  annotationOverlayDefaults,
  type AuthoringLineRuntime,
} from "./authoring-visual-runtime";
import { createPathAuthoringController } from "./create-path-authoring-controller";
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
import { createHorizontalLinePreviewController } from "./create-horizontal-line-preview-controller";
import {
  AREA_EDGE_CROSSING_PROJECTION_MODES,
  canAppendAreaPointWithoutActualEdgeCrossing,
} from "./area-edge-crossing.helpers";

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const POLYGON_LOOP_OVERLAY_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";
const AREA_LABEL_OVERLAY_LAYER_ID =
  "annotation-overlay-area-preview-label-layer";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
} = ANNOTATION_TYPES;

type AuthoringAreaLabelState = {
  text: string;
  anchorECEF: Vector3;
};

type ProjectionNormalSegment = {
  fromPlaneCoordinate: AnnotationGeographicCoordinate;
  toSampleCoordinate: AnnotationGeographicCoordinate;
};

type ProjectionNormalController = {
  setSegments: (
    segments: readonly ProjectionNormalSegment[],
    requestRender?: boolean
  ) => void;
  clear: (requestRender?: boolean) => void;
  destroy: () => void;
};

export type PolygonAuthoringMeasurementCoordinatesResolver = (args: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  previousCoordinates?: readonly AnnotationGeographicCoordinate[];
  preferredFacingPositionECEF?: Vector3 | null;
  inputModifier?: PointQueryPickResult["inputModifier"];
}) => PolygonAuthoringMeasurementCoordinatesResolution | null;

export type PolygonAuthoringMeasurementCoordinatesResolution =
  | readonly AnnotationGeographicCoordinate[]
  | {
      lineCoordinates: readonly AnnotationGeographicCoordinate[];
      fillCoordinates: readonly AnnotationGeographicCoordinate[] | null;
      fillCoordinateRings?: readonly (readonly AnnotationGeographicCoordinate[])[];
      markerCoordinates?: readonly AnnotationGeographicCoordinate[];
    };

const isMeasurementCoordinateArrayResolution = (
  resolution: PolygonAuthoringMeasurementCoordinatesResolution | null
): resolution is readonly AnnotationGeographicCoordinate[] =>
  Array.isArray(resolution);

export type PolygonAuthoringPointQueryVisualStyleResolver = (args: {
  pickResult: PointQueryPickResult | null;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
  currentPointQueryPickAcceptable: boolean;
}) => AnnotationPointQueryVisualStyle | undefined;

const buildClosedLoopCoordinates = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): readonly AnnotationGeographicCoordinate[] => {
  if (coordinates.length < 3) {
    return [];
  }

  return [...coordinates, coordinates[0]!];
};

const buildFillLoopPreviewCoordinates = (
  fillCoordinateRings: readonly (readonly AnnotationGeographicCoordinate[])[]
): readonly AnnotationGeographicCoordinate[] => {
  const validFillCoordinateRings = fillCoordinateRings.filter(
    (coordinates) => coordinates.length >= 3
  );
  if (validFillCoordinateRings.length === 0) {
    return [];
  }
  if (validFillCoordinateRings.length === 1) {
    return buildClosedLoopCoordinates(validFillCoordinateRings[0]!);
  }

  const firstRing = validFillCoordinateRings[0]!;
  return [
    firstRing[0]!,
    ...validFillCoordinateRings.map(
      (coordinates) => coordinates[coordinates.length - 1]!
    ),
  ];
};

const normalizeMeasurementCoordinatesResolution = (
  resolution: PolygonAuthoringMeasurementCoordinatesResolution | null
): {
  lineCoordinates: readonly AnnotationGeographicCoordinate[];
  fillCoordinates: readonly AnnotationGeographicCoordinate[] | null;
  fillCoordinateRings?: readonly (readonly AnnotationGeographicCoordinate[])[];
  markerCoordinates?: readonly AnnotationGeographicCoordinate[];
} | null =>
  isMeasurementCoordinateArrayResolution(resolution)
    ? {
        lineCoordinates: resolution,
        fillCoordinates: resolution,
        fillCoordinateRings: [resolution],
        markerCoordinates: resolution,
      }
    : resolution;

const toScreenPoint = (
  engine: NonNullable<AnnotationToolAuthoringContext["engine"]>,
  positionECEF: Vector3
): CssPixelPosition | null => {
  const screenPosition = engine.worldToScreen(positionECEF);
  if (!screenPosition) {
    return null;
  }

  return {
    x: screenPosition.x as CssPixelPosition["x"],
    y: screenPosition.y as CssPixelPosition["y"],
  };
};

const averageVector3 = (positions: readonly Vector3[]): Vector3 | null => {
  if (positions.length === 0) {
    return null;
  }

  const accumulated = positions.reduce(
    (result, position) => result.add(position),
    new Vector3()
  );

  return accumulated.multiplyScalar(1 / positions.length);
};

const createProjectionNormalController = ({
  engine,
  idPrefix,
  colorCss,
  strokeWidth,
}: {
  engine: NonNullable<AnnotationToolAuthoringContext["engine"]>;
  idPrefix: string;
  colorCss: string;
  strokeWidth: number;
}): ProjectionNormalController => {
  const lineCollection = createLineCollection(engine);
  const lines: AuthoringLineRuntime[] = [];

  const ensureLineCount = (count: number) => {
    while (lines.length < count) {
      lines.push(
        createLineRuntime(
          lineCollection,
          `${idPrefix}-projection-normal-${lines.length}`,
          colorCss,
          {
            width: strokeWidth,
          }
        )
      );
    }
  };

  return {
    setSegments: (segments, requestRender = true) => {
      ensureLineCount(segments.length);
      segments.forEach((segment, index) => {
        const line = lines[index];
        if (!line) return;
        applyLineRuntime(line, [
          ecefFromGeographicCoordinate(segment.fromPlaneCoordinate),
          ecefFromGeographicCoordinate(segment.toSampleCoordinate),
        ]);
      });
      lines.slice(segments.length).forEach(clearLineRuntime);
      if (requestRender) {
        engine.requestRender();
      }
    },
    clear: (requestRender = true) => {
      lines.forEach(clearLineRuntime);
      if (requestRender) {
        engine.requestRender();
      }
    },
    destroy: () => {
      lineCollection.destroy();
    },
  };
};

const buildPolygonPreviewAreaLabelState = ({
  toolType,
  coordinateRings,
  formatOptions,
}: {
  toolType: AnnotationTypes["AREA_GROUND"] | AnnotationTypes["AREA_PLANAR"];
  coordinateRings: readonly (readonly AnnotationGeographicCoordinate[])[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): AuthoringAreaLabelState | null => {
  const validCoordinateRings = coordinateRings.filter(
    (coordinates) => coordinates.length >= 3
  );
  if (validCoordinateRings.length === 0) {
    return null;
  }

  const derivedAreaSquareMeters = validCoordinateRings.reduce(
    (sum, coordinates, ringIndex) => {
      const coordinateEntries = coordinates.map(
        (coordinate, coordinateIndex) =>
          [
            `preview-area-node-${ringIndex}-${coordinateIndex}`,
            ecefFromGeographicCoordinate(coordinate),
          ] as const
      );
      const pointById = new Map(coordinateEntries);
      const derivedMeasurement = computePolygonGroupDerivedData(
        {
          id: `preview-area-measurement-${ringIndex}`,
          type: toolType,
          nodeIds: coordinateEntries.map(([nodeId]) => nodeId),
          edgeRelationIds: [],
          closed: true,
          planeLocked: toolType === ANNOTATION_TYPE_AREA_PLANAR,
        } satisfies NodeChainAnnotation,
        pointById
      );

      return sum + Math.max(0, derivedMeasurement.areaSquareMeters ?? 0);
    },
    0
  );
  const anchorECEF = averageVector3(
    validCoordinateRings.flatMap((coordinates) =>
      coordinates.map((coordinate) => ecefFromGeographicCoordinate(coordinate))
    )
  );

  if (!anchorECEF) {
    return null;
  }

  return {
    text: formatAreaSquareMetersAdaptive(
      derivedAreaSquareMeters,
      formatOptions.areaSquareMeters
    ),
    anchorECEF,
  };
};

export const createPolygonAuthoringController = ({
  toolType,
  draftToolId,
  context,
  occlusionStyleOptions,
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
    colorCss: getAnnotationAreaCssColor(toolType, 0.9),
    strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
  });
  const initialHorizontalLinePreviewController =
    showInitialHorizontalLinePreview
      ? createHorizontalLinePreviewController(engine, {
          id: `${previewId}-initial-horizontal-line-preview-disc`,
          colorCss:
            initialHorizontalLinePreviewDiskColorCss ??
            getAnnotationAreaCssColor(toolType, 1),
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
    accentColor: getAnnotationAreaCssColor(toolType, 1),
    visualOptions: lineLabelOptions,
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [...drafts.get(previewId).coordinates];
  let currentAreaLabelState: AuthoringAreaLabelState | null = null;
  let currentPointQueryPickAcceptable = true;

  const render = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    if (!enabled || draftCoordinates.length === 0) {
      currentPointQueryPickAcceptable = true;
      draftChainController.clear(false);
      polygonLoopController.clear(false);
      projectionNormalController.clear(false);
      initialHorizontalLinePreviewController?.clear(false);
      previewFillController.clear(false);
      previewOverlayFillController.clear(false);
      currentAreaLabelState = null;
      areaLabelController.setState(null);
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const sampleCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];
    const resolveCoordinates = (
      coordinates: readonly AnnotationGeographicCoordinate[],
      options: { inputModifier?: PointQueryPickResult["inputModifier"] } = {}
    ) =>
      normalizeMeasurementCoordinatesResolution(
        resolveMeasurementCoordinates
          ? resolveMeasurementCoordinates({
              coordinates,
              previousCoordinates: draftCoordinates,
              preferredFacingPositionECEF: engine.getCameraPositionECEF(),
              ...(options.inputModifier
                ? { inputModifier: options.inputModifier }
                : {}),
            })
          : coordinates
      );
    const rawResolvedSampleCoordinates = resolveCoordinates(sampleCoordinates, {
      inputModifier: pointQueryPickResult?.inputModifier,
    });
    const resolvedDraftCoordinates =
      resolveMeasurementCoordinates && hoverCoordinate
        ? resolveCoordinates(draftCoordinates)
        : null;
    const sampleLineCoordinates =
      rawResolvedSampleCoordinates?.lineCoordinates ?? null;
    const sampleRejectedByActualEdgeCrossing = Boolean(
      hoverCoordinate &&
        sampleLineCoordinates &&
        !canAppendAreaPointWithoutActualEdgeCrossing({
          previousCoordinates:
            resolvedDraftCoordinates?.lineCoordinates ?? draftCoordinates,
          nextCoordinates: sampleLineCoordinates,
          projectionMode: areaEdgeCrossingProjectionMode,
        })
    );
    const resolvedSampleCoordinates = sampleRejectedByActualEdgeCrossing
      ? null
      : rawResolvedSampleCoordinates;
    const resolvedMeasurementCoordinates =
      resolvedSampleCoordinates ?? resolvedDraftCoordinates;
    const isSamplingInitialSegment =
      resolveMeasurementCoordinates !== undefined &&
      sampleCoordinates.length < 3;
    const lineCoordinates =
      resolvedMeasurementCoordinates?.lineCoordinates ??
      (sampleRejectedByActualEdgeCrossing
        ? draftCoordinates
        : isSamplingInitialSegment || !resolveMeasurementCoordinates
        ? sampleCoordinates
        : draftCoordinates);
    const fillCoordinates = sampleRejectedByActualEdgeCrossing
      ? null
      : !resolveMeasurementCoordinates
      ? sampleCoordinates
      : isSamplingInitialSegment
      ? null
      : resolvedMeasurementCoordinates?.fillCoordinates ?? null;
    const fillCoordinateRings = sampleRejectedByActualEdgeCrossing
      ? []
      : !resolveMeasurementCoordinates
      ? [sampleCoordinates]
      : isSamplingInitialSegment
      ? []
      : resolvedMeasurementCoordinates?.fillCoordinateRings ??
        (fillCoordinates ? [fillCoordinates] : []);
    const markerCoordinates = isSamplingInitialSegment
      ? resolvedSampleCoordinates?.markerCoordinates ?? lineCoordinates
      : sampleRejectedByActualEdgeCrossing
      ? draftCoordinates
      : resolvedSampleCoordinates || !hoverCoordinate
      ? sampleCoordinates
      : draftCoordinates;
    const hasLineCoordinates =
      !resolveMeasurementCoordinates ||
      isSamplingInitialSegment ||
      resolvedMeasurementCoordinates !== null;
    const hasFillCoordinates = fillCoordinateRings.some(
      (coordinates) => coordinates.length >= 3
    );
    currentPointQueryPickAcceptable =
      !hoverCoordinate || resolvedSampleCoordinates !== null;

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
      {
        lineCoordinates,
        markerCoordinates,
      },
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
      projectionNormalController.clear(false);
      previewFillController.clear(false);
      previewOverlayFillController.clear(false);
      currentAreaLabelState = null;
      areaLabelController.setState(null);
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    projectionNormalController.setSegments(
      lineCoordinates.flatMap((fromPlaneCoordinate, index) => {
        const toSampleCoordinate = markerCoordinates[index];
        return toSampleCoordinate
          ? [
              {
                fromPlaneCoordinate,
                toSampleCoordinate,
              },
            ]
          : [];
      }),
      false
    );

    if (!hasFillCoordinates) {
      previewFillController.clear(false);
      previewOverlayFillController.clear(false);
      currentAreaLabelState = null;
      areaLabelController.setState(null);
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    const previewFill = getAnnotationAreaFillCssColor(toolType, false);
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
    currentAreaLabelState = buildPolygonPreviewAreaLabelState({
      toolType,
      coordinateRings: fillCoordinateRings,
      formatOptions,
    });
    const nextAreaLabelState = currentAreaLabelState;
    areaLabelController.setState(
      nextAreaLabelState
        ? {
            text: nextAreaLabelState.text,
            screenPosition: toScreenPoint(
              engine,
              nextAreaLabelState.anchorECEF
            ),
          }
        : null
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
