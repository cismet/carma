import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  getAnnotationAreaCssColor,
  getAnnotationAreaFillCssColor,
  type NodeChainAnnotation,
  type AnnotationToolId,
  type AnnotationTypes,
} from "@carma-mapping/annotations/core";
import { Cartesian3, SceneTransforms, defined } from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";
import {
  formatAreaSquareMetersAdaptive,
  type CssPixelPosition,
} from "@carma-units";
import {
  buildTextOnlyPointLabelOverlayState,
  createTransientPointLabelController,
} from "@carma-providers/label-overlay";
import type { CesiumGeographicCoordinate } from "../store";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  destroyLineCollection,
  previewControllerDefaults,
  type PreviewLineRuntime,
} from "./authoring-visual-runtime";
import { createPathAuthoringController } from "./create-path-authoring-controller";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "../render/measurement-render-models";
import { createMeasurementPolygonFillsController } from "../render/measurement-polygon-fills-controller.shared";
import { createMeasurementOverlayPolygonFillsController } from "../render/measurement-overlay-polygon-fills-controller.shared";
import {
  resolveAnnotationLineLabelOptions,
  resolveAnnotationLineLabelSurfaceBlendMode,
} from "../config/annotation-line-label-options";
import {
  isCoplanarPolygonFillPlacement,
  resolveAreaOcclusionLineRenderOptions,
  resolveAreaOcclusionStyleOptions,
  resolveAreaOverlayFillColor,
  type AreaOcclusionStyleOptions,
} from "../config/area-occlusion-style-options";
import {
  resolveMeasurementLineStyleOptions,
  type MeasurementLineStyleOptions,
} from "../config/measurement-line-style-options";

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const POLYGON_LOOP_OVERLAY_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
} = ANNOTATION_TYPES;

type PreviewAreaLabelState = {
  text: string;
  anchorECEF: Cartesian3;
};

type ProjectionNormalSegment = {
  fromPlaneCoordinate: CesiumGeographicCoordinate;
  toSampleCoordinate: CesiumGeographicCoordinate;
};

type ProjectionNormalController = {
  setSegments: (segments: readonly ProjectionNormalSegment[]) => void;
  clear: () => void;
  destroy: () => void;
};

export type PolygonAuthoringMeasurementCoordinatesResolver = (args: {
  coordinates: readonly CesiumGeographicCoordinate[];
  previousCoordinates?: readonly CesiumGeographicCoordinate[];
  preferredFacingPositionECEF?: Cartesian3 | null;
}) => readonly CesiumGeographicCoordinate[] | null;

const buildClosedLoopCoordinates = (
  coordinates: readonly CesiumGeographicCoordinate[]
): readonly CesiumGeographicCoordinate[] => {
  if (coordinates.length < 3) {
    return [];
  }

  return [...coordinates, coordinates[0]!];
};

const toScreenPoint = (
  scene: NonNullable<AnnotationToolAuthoringContext["scene"]>,
  positionECEF: Cartesian3
): CssPixelPosition | null => {
  const screenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    positionECEF
  );
  if (!defined(screenPosition)) {
    return null;
  }

  return {
    x: screenPosition.x as CssPixelPosition["x"],
    y: screenPosition.y as CssPixelPosition["y"],
  };
};

const averageCartesian3 = (
  positions: readonly Cartesian3[]
): Cartesian3 | null => {
  if (positions.length === 0) {
    return null;
  }

  const accumulated = positions.reduce(
    (result, position) => Cartesian3.add(result, position, result),
    new Cartesian3()
  );

  return Cartesian3.multiplyByScalar(
    accumulated,
    1 / positions.length,
    accumulated
  );
};

const createProjectionNormalController = ({
  scene,
  idPrefix,
  colorCss,
  strokeWidth,
}: {
  scene: NonNullable<AnnotationToolAuthoringContext["scene"]>;
  idPrefix: string;
  colorCss: string;
  strokeWidth: number;
}): ProjectionNormalController => {
  const lineCollection = createLineCollection(scene);
  const lines: PreviewLineRuntime[] = [];

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
    setSegments: (segments) => {
      ensureLineCount(segments.length);
      segments.forEach((segment, index) => {
        const line = lines[index];
        if (!line) return;
        applyLineRuntime(line, [
          cartesian3FromGeographicCoordinate(segment.fromPlaneCoordinate),
          cartesian3FromGeographicCoordinate(segment.toSampleCoordinate),
        ]);
      });
      lines.slice(segments.length).forEach(clearLineRuntime);
      scene.requestRender();
    },
    clear: () => {
      lines.forEach(clearLineRuntime);
      scene.requestRender();
    },
    destroy: () => {
      destroyLineCollection(scene, lineCollection);
    },
  };
};

const buildPolygonPreviewAreaLabelState = ({
  toolType,
  coordinates,
  formatOptions,
}: {
  toolType: AnnotationTypes["AREA_GROUND"] | AnnotationTypes["AREA_PLANAR"];
  coordinates: readonly CesiumGeographicCoordinate[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): PreviewAreaLabelState | null => {
  if (coordinates.length < 3) {
    return null;
  }

  const coordinateEntries = coordinates.map(
    (coordinate, index) =>
      [
        `preview-area-node-${index}`,
        cartesian3FromGeographicCoordinate(coordinate),
      ] as const
  );
  const pointById = new Map(coordinateEntries);
  const derivedMeasurement = computePolygonGroupDerivedData(
    {
      id: "preview-area-measurement",
      type: toolType,
      nodeIds: coordinateEntries.map(([nodeId]) => nodeId),
      edgeRelationIds: [],
      closed: true,
      planeLocked: toolType === ANNOTATION_TYPE_AREA_PLANAR,
    } satisfies NodeChainAnnotation,
    pointById
  );
  const anchorECEF = averageCartesian3(
    coordinateEntries.map(([, positionECEF]) => positionECEF)
  );

  if (!anchorECEF) {
    return null;
  }

  return {
    text: formatAreaSquareMetersAdaptive(
      Math.max(0, derivedMeasurement.areaSquareMeters ?? 0),
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
  measurementLineStyleOptions,
  resolveMeasurementCoordinates,
}: {
  toolType: AnnotationTypes["AREA_GROUND"] | AnnotationTypes["AREA_PLANAR"];
  draftToolId?: AnnotationToolId;
  context: AnnotationToolAuthoringContext;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  measurementLineStyleOptions?: MeasurementLineStyleOptions;
  resolveMeasurementCoordinates?: PolygonAuthoringMeasurementCoordinatesResolver;
}): AnnotationToolAuthoringController | null => {
  const {
    scene,
    drafts,
    labelOverlay,
    formatOptions,
    lineLabelOptions,
  } = context;
  if (!scene || scene.isDestroyed()) {
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
  const resolvedLineStyleOptions = resolveMeasurementLineStyleOptions(
    measurementLineStyleOptions
  );
  const previewLineOptions = {
    ...(resolveAreaOcclusionLineRenderOptions(resolvedOcclusionStyleOptions) ??
      {}),
    strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
    overlayDashPattern: resolvedLineStyleOptions.overlayDashPattern,
  };

  const draftChainController = createPathAuthoringController(scene, {
    overlayLayerId: DRAFT_CHAIN_OVERLAY_LAYER_ID,
    lineId: `${previewId}-draft-preview-chain`,
    lineColor: previewControllerDefaults.draftChainColor,
    showPointMarkers: true,
    lineOptions: previewLineOptions,
  });
  const polygonLoopController = createPathAuthoringController(scene, {
    overlayLayerId: POLYGON_LOOP_OVERLAY_LAYER_ID,
    lineId: `${previewId}-draft-preview-loop`,
    lineColor: previewControllerDefaults.draftChainColor,
    showPointMarkers: false,
    lineOptions: previewLineOptions,
  });
  const projectionNormalController = createProjectionNormalController({
    scene,
    idPrefix: `${previewId}-draft`,
    colorCss: getAnnotationAreaCssColor(toolType, 0.9),
    strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
  });
  const previewFillController = createMeasurementPolygonFillsController(scene, {
    allowPicking: false,
  });
  const previewOverlayFillController =
    createMeasurementOverlayPolygonFillsController(
      scene,
      `${previewId}-draft-preview`
    );
  const areaLabelController = createTransientPointLabelController({
    labelOverlay,
    overlayId: `${previewId}-draft-area-label`,
    requestRender: () => scene.requestRender(),
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [...drafts.get(previewId).coordinates];
  let currentAreaLabelState: PreviewAreaLabelState | null = null;
  const resolvedAnnotationLineLabelOptions =
    resolveAnnotationLineLabelOptions(lineLabelOptions);

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    if (!enabled || draftCoordinates.length === 0) {
      draftChainController.clear();
      polygonLoopController.clear();
      projectionNormalController.clear();
      previewFillController.clear();
      previewOverlayFillController.clear();
      currentAreaLabelState = null;
      areaLabelController.setState(null);
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const sampleCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];
    const resolveCoordinates = (
      coordinates: readonly CesiumGeographicCoordinate[]
    ) =>
      resolveMeasurementCoordinates
        ? resolveMeasurementCoordinates({
            coordinates,
            previousCoordinates: draftCoordinates,
            preferredFacingPositionECEF: scene.camera.positionWC,
          })
        : coordinates;
    const resolvedSampleCoordinates = resolveCoordinates(sampleCoordinates);
    const resolvedDraftCoordinates =
      resolveMeasurementCoordinates && hoverCoordinate
        ? resolveCoordinates(draftCoordinates)
        : null;
    const resolvedMeasurementCoordinates =
      resolvedSampleCoordinates ?? resolvedDraftCoordinates;
    const isSamplingInitialSegment =
      resolveMeasurementCoordinates !== undefined &&
      sampleCoordinates.length < 3;
    const previewCoordinates =
      resolvedMeasurementCoordinates ??
      (isSamplingInitialSegment || !resolveMeasurementCoordinates
        ? sampleCoordinates
        : draftCoordinates);
    const markerCoordinates =
      isSamplingInitialSegment && resolvedSampleCoordinates
        ? resolvedSampleCoordinates
        : resolvedSampleCoordinates || isSamplingInitialSegment || !hoverCoordinate
          ? sampleCoordinates
          : draftCoordinates;
    const hasResolvedMeasurementCoordinates =
      !resolveMeasurementCoordinates ||
      isSamplingInitialSegment ||
      resolvedMeasurementCoordinates !== null;

    draftChainController.setState({
      lineCoordinates: previewCoordinates,
      markerCoordinates,
    });
    polygonLoopController.setState({
      lineCoordinates: hasResolvedMeasurementCoordinates
        ? buildClosedLoopCoordinates(previewCoordinates)
        : [],
      markerCoordinates: [],
    });

    if (!hasResolvedMeasurementCoordinates || previewCoordinates.length < 3) {
      projectionNormalController.clear();
      previewFillController.clear();
      previewOverlayFillController.clear();
      currentAreaLabelState = null;
      areaLabelController.setState(null);
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    projectionNormalController.setSegments(
      previewCoordinates.flatMap((fromPlaneCoordinate, index) => {
        const toSampleCoordinate = markerCoordinates[index];
        return toSampleCoordinate
          ? [
              {
                fromPlaneCoordinate,
                toSampleCoordinate,
              },
            ]
          : [];
      })
    );

    const previewFill = getAnnotationAreaFillCssColor(toolType, false);
    const previewPolygonFill = {
      id: `${previewId}-draft-preview-fill`,
      coordinates: previewCoordinates,
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
    };
    const previewPolygonFills = [previewPolygonFill];
    previewFillController.setPolygonFills(previewPolygonFills);
    previewOverlayFillController.setPolygonFills(
      previewPolygonFill.overlayFill ? previewPolygonFills : []
    );
    currentAreaLabelState = buildPolygonPreviewAreaLabelState({
      toolType,
      coordinates: previewCoordinates,
      formatOptions,
    });
    const nextAreaLabelState = currentAreaLabelState;
    areaLabelController.setState(
      nextAreaLabelState
        ? buildTextOnlyPointLabelOverlayState({
            text: nextAreaLabelState.text,
            lineColor: getAnnotationAreaCssColor(toolType, 1),
            theme: resolvedAnnotationLineLabelOptions.appearance.themeStyle,
            fontFamily: resolvedAnnotationLineLabelOptions.text.fontFamily,
            fontWeight: resolvedAnnotationLineLabelOptions.text.fontWeight,
            mixBlendMode: resolveAnnotationLineLabelSurfaceBlendMode(
              resolvedAnnotationLineLabelOptions
            ),
            getScreenPosition: () =>
              toScreenPoint(scene, nextAreaLabelState.anchorECEF),
          })
        : null
    );
    if (requestRender) {
      scene.requestRender();
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
    setPointQueryPickResult: (pickResult) => {
      pointQueryPickResult = pickResult;
      render();
    },
    destroy: () => {
      unsubscribe();
      draftChainController.destroy();
      polygonLoopController.destroy();
      projectionNormalController.destroy();
      previewFillController.destroy();
      previewOverlayFillController.destroy();
      areaLabelController.destroy();
    },
  };
};
