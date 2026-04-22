import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry/annotation-tool-plugin.types";
import {
  ANNOTATION_TYPES,
  buildOutsideReferencePoint2D,
  getAnnotationAreaCssColor,
  getAnnotationAreaFillCssColor,
  getVerticalRectanglePreviewAreaSquareMeters,
} from "@carma-mapping/annotations/core";
import { Cartesian3, SceneTransforms, defined } from "@carma-cesium";
import { formatAreaSquareMetersAdaptive, formatLengthMeters, type CssPixelPosition } from "@carma-units";
import {
  buildTextOnlyPointLabelOverlayState,
  createTransientPointLabelController,
} from "@carma-providers/label-overlay";
import { isValidScene } from "@carma-mapping/engines/cesium/core";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import {
  applyLineLabel,
  buildVerticalAreaLoopCoordinates,
  createPreviewOverlayLayer,
  createSegmentLineLabels,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  previewControllerDefaults,
  runtimeCoordinateFromCartesian,
} from "./authoring-visual-runtime";
import { createPathAuthoringController } from "./create-path-authoring-controller";
import { RUNTIME_POLYGON_FILL_PLACEMENT } from "../render/measurement-render-models";
import { createMeasurementPolygonFillsController } from "../render/measurement-polygon-fills-controller.shared";
import {
  resolvePreviewLineLabelVisualOptions,
} from "../config/preview-line-label-visual-defaults";
const { AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL } = ANNOTATION_TYPES;

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const POLYGON_LOOP_OVERLAY_LAYER_ID =
  "annotation-overlay-polygon-loop-preview-layer";
const VERTICAL_AREA_PREVIEW_LABEL_LAYER_ID =
  "annotation-overlay-vertical-area-preview-label-layer";

type PreviewAreaLabelState = {
  text: string;
  anchorECEF: Cartesian3;
};

type PreviewVerticalAreaEdgeLabelsState = {
  insideAnchorECEF: Cartesian3;
  verticalText: string;
  verticalStartECEF: Cartesian3;
  verticalEndECEF: Cartesian3;
  horizontalText: string;
  horizontalStartECEF: Cartesian3;
  horizontalEndECEF: Cartesian3;
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

const buildVerticalAreaPreviewAreaLabelState = ({
  loopCoordinates,
  formatOptions,
}: {
  loopCoordinates: readonly Cartesian3[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): PreviewAreaLabelState | null => {
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
    anchorECEF: Cartesian3.midpoint(
      firstCorner,
      oppositeCorner,
      new Cartesian3()
    ),
  };
};

const buildVerticalAreaPreviewEdgeLabelsState = ({
  loopCoordinates,
  formatOptions,
}: {
  loopCoordinates: readonly Cartesian3[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): PreviewVerticalAreaEdgeLabelsState | null => {
  const firstCorner = loopCoordinates[0];
  const oppositeCorner = loopCoordinates[2];
  const adjacentVerticalCorner = loopCoordinates[3];
  if (!firstCorner || !oppositeCorner || !adjacentVerticalCorner) {
    return null;
  }

  return {
    insideAnchorECEF: Cartesian3.midpoint(
      firstCorner,
      oppositeCorner,
      new Cartesian3()
    ),
    verticalText: formatLengthMeters(
      Cartesian3.distance(adjacentVerticalCorner, firstCorner),
      formatOptions.lengthMeters
    ),
    verticalStartECEF: adjacentVerticalCorner,
    verticalEndECEF: firstCorner,
    horizontalText: formatLengthMeters(
      Cartesian3.distance(oppositeCorner, adjacentVerticalCorner),
      formatOptions.lengthMeters
    ),
    horizontalStartECEF: oppositeCorner,
    horizontalEndECEF: adjacentVerticalCorner,
  };
};

export const createVerticalAreaAuthoringController = (
  context: AnnotationToolAuthoringContext
): AnnotationToolAuthoringController | null => {
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

  const draftChainController = createPathAuthoringController(scene, {
    overlayLayerId: DRAFT_CHAIN_OVERLAY_LAYER_ID,
    lineId: "draft-preview-chain",
    lineColor: previewControllerDefaults.draftChainColor,
    showPointMarkers: false,
  });
  const polygonLoopController = createPathAuthoringController(scene, {
    overlayLayerId: POLYGON_LOOP_OVERLAY_LAYER_ID,
    lineId: "draft-preview-loop",
    lineColor: previewControllerDefaults.draftChainColor,
    showPointMarkers: false,
  });
  const previewFillController =
    createMeasurementPolygonFillsController(scene);
  const labelOverlayLayer = createPreviewOverlayLayer(
    scene,
    VERTICAL_AREA_PREVIEW_LABEL_LAYER_ID
  );
  const areaLabelController = createTransientPointLabelController({
    labelOverlay,
    overlayId: `${ANNOTATION_TYPE_AREA_VERTICAL}-draft-area-label`,
    requestRender: () => scene.requestRender(),
  });
  const lineLabels = createSegmentLineLabels(previewLineLabelVisualOptions);
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
  let currentAreaLabelState: PreviewAreaLabelState | null = null;
  let currentEdgeLabelsState: PreviewVerticalAreaEdgeLabelsState | null = null;
  const resolvedPreviewLineLabelVisualOptions =
    resolvePreviewLineLabelVisualOptions(previewLineLabelVisualOptions);

  const renderOverlayLabels = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    lineLabels.direct.style.display = "none";
    if (!currentEdgeLabelsState) {
      hideLineLabels(lineLabels);
      lineLabels.direct.style.display = "none";
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    const insideScreenPosition = toScreenPoint(
      scene,
      currentEdgeLabelsState.insideAnchorECEF
    );
    const verticalStartScreenPosition = toScreenPoint(
      scene,
      currentEdgeLabelsState.verticalStartECEF
    );
    const verticalEndScreenPosition = toScreenPoint(
      scene,
      currentEdgeLabelsState.verticalEndECEF
    );
    const horizontalStartScreenPosition = toScreenPoint(
      scene,
      currentEdgeLabelsState.horizontalStartECEF
    );
    const horizontalEndScreenPosition = toScreenPoint(
      scene,
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
      scene.requestRender();
    }
  };

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    const firstCorner = draftCoordinates[0] ?? null;
    if (!enabled || !firstCorner) {
      draftChainController.clear();
      polygonLoopController.clear();
      previewFillController.clear();
      currentAreaLabelState = null;
      currentEdgeLabelsState = null;
      areaLabelController.setState(null);
      renderOverlayLabels(requestRender);
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    if (!hoverCoordinate) {
      draftChainController.setState({
        lineCoordinates: [],
        markerCoordinates: [firstCorner],
      });
      polygonLoopController.clear();
      previewFillController.clear();
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
      draftChainController.setState({
        lineCoordinates: [firstCorner, hoverCoordinate],
        markerCoordinates: [firstCorner, hoverCoordinate],
      });
      polygonLoopController.clear();
      previewFillController.clear();
      currentAreaLabelState = null;
      currentEdgeLabelsState = null;
      renderOverlayLabels(requestRender);
      return;
    }

    const markerCoordinates = [
      firstCorner,
      ...loopCoordinates.slice(1, 4).map(runtimeCoordinateFromCartesian),
    ];

    draftChainController.clear();
    polygonLoopController.setState({
      lineCoordinates: loopCoordinates.map(runtimeCoordinateFromCartesian),
      markerCoordinates,
    });
    previewFillController.setPolygonFills([
      {
        id: `${ANNOTATION_TYPE_AREA_VERTICAL}-draft-preview-fill`,
        coordinates: loopCoordinates
          .slice(0, 4)
          .map(runtimeCoordinateFromCartesian),
        fill: getAnnotationAreaFillCssColor(
          ANNOTATION_TYPE_AREA_VERTICAL,
          false
        ),
        placement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
      },
    ]);
    currentAreaLabelState = buildVerticalAreaPreviewAreaLabelState({
      loopCoordinates,
      formatOptions,
    });
    const nextAreaLabelState = currentAreaLabelState;
    areaLabelController.setState(
      nextAreaLabelState
        ? buildTextOnlyPointLabelOverlayState({
            text: nextAreaLabelState.text,
            lineColor: getAnnotationAreaCssColor(
              ANNOTATION_TYPE_AREA_VERTICAL,
              1
            ),
            theme: resolvedPreviewLineLabelVisualOptions.theme,
            fontFamily: resolvedPreviewLineLabelVisualOptions.fontFamily,
            fontWeight: resolvedPreviewLineLabelVisualOptions.fontWeight,
            getScreenPosition: () =>
              toScreenPoint(scene, nextAreaLabelState.anchorECEF),
          })
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
    if (
      areCoordinateListsEqual(draftCoordinates, nextDraftCoordinates)
    ) {
      return;
    }

    draftCoordinates = [...nextDraftCoordinates];
    render();
  });
  const removePostRenderListener = scene.postRender.addEventListener(() => {
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
    setPointQueryPickResult: (pickResult) => {
      pointQueryPickResult = pickResult;
      render();
    },
    destroy: () => {
      unsubscribe();
      removePostRenderListener();
      draftChainController.destroy();
      polygonLoopController.destroy();
      previewFillController.destroy();
      areaLabelController.destroy();
      destroyPreviewOverlayLayer(labelOverlayLayer);
    },
  };
};
