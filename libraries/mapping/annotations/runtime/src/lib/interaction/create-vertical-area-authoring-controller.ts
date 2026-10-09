import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry";
import {
  ANNOTATION_TYPES,
  buildOutsideReferencePoint2D,
  getAnnotationAreaCssColor,
  getAnnotationAreaFillCssColor,
  getVerticalRectanglePreviewAreaSquareMeters,
} from "@carma-mapping/annotations/core";
import { Vector3 } from "three";
import {
  formatAreaSquareMetersAdaptive,
  formatLengthMeters,
  type CssPixelPosition,
} from "@carma-units";
import { isValidAnnotationEngine } from "../engine";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import {
  applyLineLabel,
  buildVerticalAreaLoopCoordinates,
  createAreaLabelController,
  createAnnotationOverlayLayer,
  createSegmentLineLabels,
  destroyAnnotationOverlayLayer,
  hideLineLabels,
  annotationOverlayDefaults,
  runtimeCoordinateFromEcef,
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
const { AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL } = ANNOTATION_TYPES;

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const POLYGON_LOOP_OVERLAY_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";
const VERTICAL_AREA_PREVIEW_LABEL_LAYER_ID =
  "annotation-overlay-vertical-area-preview-label-layer";

type AuthoringAreaLabelState = {
  text: string;
  anchorECEF: Vector3;
};

type PreviewVerticalAreaEdgeLabelsState = {
  insideAnchorECEF: Vector3;
  verticalText: string;
  verticalStartECEF: Vector3;
  verticalEndECEF: Vector3;
  horizontalText: string;
  horizontalStartECEF: Vector3;
  horizontalEndECEF: Vector3;
};

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

const buildVerticalAreaPreviewAreaLabelState = ({
  loopCoordinates,
  formatOptions,
}: {
  loopCoordinates: readonly Vector3[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): AuthoringAreaLabelState | null => {
  const firstCorner = loopCoordinates[0];
  const oppositeCorner = loopCoordinates[2];
  if (!firstCorner || !oppositeCorner) {
    return null;
  }

  return {
    text: formatAreaSquareMetersAdaptive(
      getVerticalRectanglePreviewAreaSquareMeters(firstCorner, oppositeCorner),
      formatOptions.areaSquareMeters
    ),
    anchorECEF: new Vector3()
      .addVectors(firstCorner, oppositeCorner)
      .multiplyScalar(0.5),
  };
};

const buildVerticalAreaPreviewEdgeLabelsState = ({
  loopCoordinates,
  formatOptions,
}: {
  loopCoordinates: readonly Vector3[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): PreviewVerticalAreaEdgeLabelsState | null => {
  const firstCorner = loopCoordinates[0];
  const oppositeCorner = loopCoordinates[2];
  const adjacentVerticalCorner = loopCoordinates[3];
  if (!firstCorner || !oppositeCorner || !adjacentVerticalCorner) {
    return null;
  }

  return {
    insideAnchorECEF: new Vector3()
      .addVectors(firstCorner, oppositeCorner)
      .multiplyScalar(0.5),
    verticalText: formatLengthMeters(
      adjacentVerticalCorner.distanceTo(firstCorner),
      formatOptions.lengthMeters
    ),
    verticalStartECEF: adjacentVerticalCorner,
    verticalEndECEF: firstCorner,
    horizontalText: formatLengthMeters(
      oppositeCorner.distanceTo(adjacentVerticalCorner),
      formatOptions.lengthMeters
    ),
    horizontalStartECEF: oppositeCorner,
    horizontalEndECEF: adjacentVerticalCorner,
  };
};

export const createVerticalAreaAuthoringController = ({
  context,
  occlusionStyleOptions,
  annotationLineStyleOptions,
}: {
  context: AnnotationToolAuthoringContext;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  annotationLineStyleOptions?: AnnotationLineStyleOptions;
}): AnnotationToolAuthoringController | null => {
  const { engine, drafts, formatOptions, lineLabelOptions } = context;
  if (!engine || engine.isDestroyed()) {
    return null;
  }
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const previewFillPlacement = RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR;
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
    lineId: "draft-preview-chain",
    lineColor: annotationOverlayDefaults.draftChainColor,
    showPointMarkers: true,
    lineOptions: previewLineOptions,
  });
  const polygonLoopController = createPathAuthoringController(engine, {
    overlayLayerId: POLYGON_LOOP_OVERLAY_LAYER_ID,
    lineId: "draft-preview-loop",
    lineColor: annotationOverlayDefaults.draftChainColor,
    showPointMarkers: false,
    lineOptions: previewLineOptions,
  });
  const previewFillController = createAnnotationPolygonFillsController(engine);
  const previewOverlayFillController =
    createAnnotationOverlayPolygonFillsController(
      engine,
      `${ANNOTATION_TYPE_AREA_VERTICAL}-draft-preview`
    );
  const labelOverlayLayer = createAnnotationOverlayLayer(
    engine,
    VERTICAL_AREA_PREVIEW_LABEL_LAYER_ID
  );
  const areaLabelController = createAreaLabelController({
    overlayLayer: labelOverlayLayer,
    accentColor: getAnnotationAreaCssColor(ANNOTATION_TYPE_AREA_VERTICAL, 1),
    visualOptions: lineLabelOptions,
  });
  const lineLabels = createSegmentLineLabels(lineLabelOptions);
  if (labelOverlayLayer) {
    labelOverlayLayer.append(
      lineLabels.direct,
      lineLabels.vertical,
      lineLabels.horizontal
    );
  }
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [
    ...drafts.get(ANNOTATION_TYPE_AREA_VERTICAL).coordinates,
  ];
  let currentAreaLabelState: AuthoringAreaLabelState | null = null;
  let currentEdgeLabelsState: PreviewVerticalAreaEdgeLabelsState | null = null;

  const renderOverlayLabels = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    lineLabels.direct.style.display = "none";
    if (!currentEdgeLabelsState) {
      hideLineLabels(lineLabels);
      lineLabels.direct.style.display = "none";
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    const insideScreenPosition = toScreenPoint(
      engine,
      currentEdgeLabelsState.insideAnchorECEF
    );
    const verticalStartScreenPosition = toScreenPoint(
      engine,
      currentEdgeLabelsState.verticalStartECEF
    );
    const verticalEndScreenPosition = toScreenPoint(
      engine,
      currentEdgeLabelsState.verticalEndECEF
    );
    const horizontalStartScreenPosition = toScreenPoint(
      engine,
      currentEdgeLabelsState.horizontalStartECEF
    );
    const horizontalEndScreenPosition = toScreenPoint(
      engine,
      currentEdgeLabelsState.horizontalEndECEF
    );

    if (
      insideScreenPosition &&
      verticalStartScreenPosition &&
      verticalEndScreenPosition
    ) {
      applyLineLabel({
        element: lineLabels.vertical,
        text: currentEdgeLabelsState.verticalText,
        start: verticalStartScreenPosition,
        end: verticalEndScreenPosition,
        outsideReferencePoint: buildOutsideReferencePoint2D(
          verticalStartScreenPosition,
          verticalEndScreenPosition,
          insideScreenPosition
        ),
        flipReadingDirection: true,
      });
    } else {
      lineLabels.vertical.style.display = "none";
    }

    if (
      insideScreenPosition &&
      horizontalStartScreenPosition &&
      horizontalEndScreenPosition
    ) {
      applyLineLabel({
        element: lineLabels.horizontal,
        text: currentEdgeLabelsState.horizontalText,
        start: horizontalStartScreenPosition,
        end: horizontalEndScreenPosition,
        outsideReferencePoint: buildOutsideReferencePoint2D(
          horizontalStartScreenPosition,
          horizontalEndScreenPosition,
          insideScreenPosition
        ),
      });
    } else {
      lineLabels.horizontal.style.display = "none";
    }

    if (requestRender) {
      engine.requestRender();
    }
  };

  const render = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    const firstCorner = draftCoordinates[0] ?? null;
    if (!enabled || !firstCorner) {
      draftChainController.clear(false);
      polygonLoopController.clear(false);
      previewFillController.clear(false);
      previewOverlayFillController.clear(false);
      currentAreaLabelState = null;
      currentEdgeLabelsState = null;
      areaLabelController.setState(null);
      renderOverlayLabels(requestRender);
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    if (!hoverCoordinate) {
      draftChainController.setState(
        {
          lineCoordinates: [],
          markerCoordinates: [firstCorner],
        },
        false
      );
      polygonLoopController.clear(false);
      previewFillController.clear(false);
      previewOverlayFillController.clear(false);
      currentAreaLabelState = null;
      currentEdgeLabelsState = null;
      areaLabelController.setState(null);
      renderOverlayLabels(requestRender);
      return;
    }

    const loopCoordinates = buildVerticalAreaLoopCoordinates({
      firstCorner,
      oppositeCorner: hoverCoordinate,
    });

    if (!loopCoordinates) {
      draftChainController.setState(
        {
          lineCoordinates: [firstCorner, hoverCoordinate],
          markerCoordinates: [firstCorner, hoverCoordinate],
        },
        false
      );
      polygonLoopController.clear(false);
      previewFillController.clear(false);
      previewOverlayFillController.clear(false);
      currentAreaLabelState = null;
      currentEdgeLabelsState = null;
      renderOverlayLabels(requestRender);
      return;
    }

    const markerCoordinates = [
      firstCorner,
      ...loopCoordinates.slice(1, 4).map(runtimeCoordinateFromEcef),
    ];

    draftChainController.clear(false);
    polygonLoopController.setState(
      {
        lineCoordinates: loopCoordinates.map(runtimeCoordinateFromEcef),
        markerCoordinates,
      },
      false
    );
    const previewFill = getAnnotationAreaFillCssColor(
      ANNOTATION_TYPE_AREA_VERTICAL,
      false
    );
    const previewPolygonFill = {
      id: `${ANNOTATION_TYPE_AREA_VERTICAL}-draft-preview-fill`,
      coordinates: loopCoordinates.slice(0, 4).map(runtimeCoordinateFromEcef),
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
    previewFillController.setPolygonFills([previewPolygonFill], false);
    previewOverlayFillController.setPolygonFills([previewPolygonFill], false);
    currentAreaLabelState = buildVerticalAreaPreviewAreaLabelState({
      loopCoordinates,
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
    currentEdgeLabelsState = buildVerticalAreaPreviewEdgeLabelsState({
      loopCoordinates,
      formatOptions,
    });
    renderOverlayLabels(requestRender);
  };

  const unsubscribe = drafts.subscribe(ANNOTATION_TYPE_AREA_VERTICAL, () => {
    const nextDraftCoordinates = drafts.get(
      ANNOTATION_TYPE_AREA_VERTICAL
    ).coordinates;
    if (areCoordinateListsEqual(draftCoordinates, nextDraftCoordinates)) {
      return;
    }

    draftCoordinates = [...nextDraftCoordinates];
    render();
  });
  const removePostRenderListener = engine.subscribePostRender(() => {
    renderOverlayLabels(false);
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
    destroy: () => {
      unsubscribe();
      removePostRenderListener();
      draftChainController.destroy();
      polygonLoopController.destroy();
      previewFillController.destroy();
      previewOverlayFillController.destroy();
      areaLabelController.destroy();
      destroyAnnotationOverlayLayer(labelOverlayLayer);
    },
  };
};
