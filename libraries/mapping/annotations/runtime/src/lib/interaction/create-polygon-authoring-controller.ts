import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry/annotation-tool-plugin.types";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  getAnnotationAreaCssColor,
  getAnnotationAreaFillCssColor,
  type NodeChainAnnotation,
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
import { previewControllerDefaults } from "./authoring-visual-runtime";
import { createPathAuthoringController } from "./create-path-authoring-controller";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "../render/measurement-render-models";
import { createMeasurementPolygonFillsController } from "../render/measurement-polygon-fills-controller.shared";
import { createMeasurementOverlayPolygonFillsController } from "../render/measurement-overlay-polygon-fills-controller.shared";
import { resolvePreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
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
  context,
  occlusionStyleOptions,
  measurementLineStyleOptions,
}: {
  toolType: AnnotationTypes["AREA_GROUND"] | AnnotationTypes["AREA_PLANAR"];
  context: AnnotationToolAuthoringContext;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  measurementLineStyleOptions?: MeasurementLineStyleOptions;
}): AnnotationToolAuthoringController | null => {
  const {
    scene,
    drafts,
    labelOverlay,
    formatOptions,
    previewLineLabelVisualOptions,
  } = context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }
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
    lineId: "draft-preview-chain",
    lineColor: previewControllerDefaults.draftChainColor,
    showPointMarkers: true,
    lineOptions: previewLineOptions,
  });
  const polygonLoopController = createPathAuthoringController(scene, {
    overlayLayerId: POLYGON_LOOP_OVERLAY_LAYER_ID,
    lineId: "draft-preview-loop",
    lineColor: previewControllerDefaults.draftChainColor,
    showPointMarkers: false,
    lineOptions: previewLineOptions,
  });
  const previewFillController = createMeasurementPolygonFillsController(scene);
  const previewOverlayFillController =
    createMeasurementOverlayPolygonFillsController(
      scene,
      `${toolType}-draft-preview`
    );
  const areaLabelController = createTransientPointLabelController({
    labelOverlay,
    overlayId: `${toolType}-draft-area-label`,
    requestRender: () => scene.requestRender(),
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [...drafts.get(toolType).coordinates];
  let currentAreaLabelState: PreviewAreaLabelState | null = null;
  const resolvedPreviewLineLabelVisualOptions =
    resolvePreviewLineLabelVisualOptions(previewLineLabelVisualOptions);

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    if (!enabled || draftCoordinates.length === 0) {
      draftChainController.clear();
      polygonLoopController.clear();
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
    const previewCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];

    draftChainController.setState({
      lineCoordinates: previewCoordinates,
      markerCoordinates: previewCoordinates,
    });
    polygonLoopController.setState({
      lineCoordinates: buildClosedLoopCoordinates(previewCoordinates),
      markerCoordinates: [],
    });

    if (previewCoordinates.length < 3) {
      previewFillController.clear();
      previewOverlayFillController.clear();
      currentAreaLabelState = null;
      areaLabelController.setState(null);
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    const previewFill = getAnnotationAreaFillCssColor(toolType, false);
    const previewPolygonFill = {
      id: `${toolType}-draft-preview-fill`,
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
            theme: resolvedPreviewLineLabelVisualOptions.theme,
            fontFamily: resolvedPreviewLineLabelVisualOptions.fontFamily,
            fontWeight: resolvedPreviewLineLabelVisualOptions.fontWeight,
            getScreenPosition: () =>
              toScreenPoint(scene, nextAreaLabelState.anchorECEF),
          })
        : null
    );
    if (requestRender) {
      scene.requestRender();
    }
  };

  const unsubscribe = drafts.subscribe(toolType, () => {
    const nextDraftCoordinates = drafts.get(toolType).coordinates;
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
      previewFillController.destroy();
      previewOverlayFillController.destroy();
      areaLabelController.destroy();
    },
  };
};
