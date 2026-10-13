import { geographicCoordinateFromEcef } from "@carma-geo/proj";
import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry";
import {
  ANNOTATION_TYPES,
  buildOutsideReferencePoint2D,
  defaultAnnotationAreaPalette,
  type AnnotationAreaPalette,
  getVerticalRectanglePreviewAreaSquareMeters,
  isValidAnnotationEngine,
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
} from "@carma-mapping/annotations/core";
import { Vector3 } from "three";
import {
  formatAreaSquareMetersAdaptive,
  formatLengthMeters,
} from "@carma-units";

import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import { worldToCssPixelPosition } from "./css-pixel-position";
import { annotationOverlayDefaults } from "../config/annotation-overlay-defaults";
import {
  createAreaLabelController,
  resolveAreaLabelScreenState,
  type AuthoringAreaLabelAnchor,
} from "./authoring-area-label";
import { buildVerticalAreaLoopCoordinates } from "./authoring-geometry";
import {
  applyLineLabel,
  createSegmentLineLabels,
  hideLineLabels,
} from "./authoring-line-label";
import {
  createAnnotationOverlayLayer,
  destroyAnnotationOverlayLayer,
} from "./authoring-overlay-layer";
import { createPathAuthoringController } from "./create-path-authoring-controller";
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

type PreviewVerticalAreaEdgeLabelsState = {
  insideAnchorECEF: Vector3;
  verticalText: string;
  verticalStartECEF: Vector3;
  verticalEndECEF: Vector3;
  horizontalText: string;
  horizontalStartECEF: Vector3;
  horizontalEndECEF: Vector3;
};

const buildVerticalAreaPreviewAreaLabel = ({
  loopCoordinates,
  formatOptions,
}: {
  loopCoordinates: readonly Vector3[];
  formatOptions: AnnotationToolAuthoringContext["formatOptions"];
}): AuthoringAreaLabelAnchor | null => {
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
  areaPalette = defaultAnnotationAreaPalette,
  annotationLineStyleOptions,
}: {
  context: AnnotationToolAuthoringContext;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
  /** Colours of the draft fill and guides; the host's palette when it has one. */
  areaPalette?: AnnotationAreaPalette;
  annotationLineStyleOptions?: AnnotationLineStyleOptions;
}): AnnotationToolAuthoringController | null => {
  const { engine, drafts, formatOptions, lineLabelOptions } = context;
  if (!engine || engine.isDestroyed()) {
    return null;
  }
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const previewFillPlacement = ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR;
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
    accentColor: areaPalette.cssColor(ANNOTATION_TYPE_AREA_VERTICAL, 1),
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
  let currentEdgeLabelsState: PreviewVerticalAreaEdgeLabelsState | null = null;

  const renderOverlayLabels = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    lineLabels.direct.style.display = "none";
    if (!currentEdgeLabelsState) {
      hideLineLabels(lineLabels);
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    const insideScreenPosition = worldToCssPixelPosition(
      engine,
      currentEdgeLabelsState.insideAnchorECEF
    );
    const applyEdgeLabel = (
      element: HTMLDivElement,
      text: string,
      startECEF: Vector3,
      endECEF: Vector3
    ) => {
      const start = worldToCssPixelPosition(engine, startECEF);
      const end = worldToCssPixelPosition(engine, endECEF);
      if (!insideScreenPosition || !start || !end) {
        element.style.display = "none";
        return;
      }

      applyLineLabel({
        element,
        text,
        start,
        end,
        outsideReferencePoint: buildOutsideReferencePoint2D(
          start,
          end,
          insideScreenPosition
        ),
      });
    };
    applyEdgeLabel(
      lineLabels.vertical,
      currentEdgeLabelsState.verticalText,
      currentEdgeLabelsState.verticalStartECEF,
      currentEdgeLabelsState.verticalEndECEF
    );
    applyEdgeLabel(
      lineLabels.horizontal,
      currentEdgeLabelsState.horizontalText,
      currentEdgeLabelsState.horizontalStartECEF,
      currentEdgeLabelsState.horizontalEndECEF
    );

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
      currentEdgeLabelsState = null;
      renderOverlayLabels(requestRender);
      return;
    }

    const markerCoordinates = [
      firstCorner,
      ...loopCoordinates
        .slice(1, 4)
        .map((position) => geographicCoordinateFromEcef(position)),
    ];

    draftChainController.clear(false);
    polygonLoopController.setState(
      {
        lineCoordinates: loopCoordinates.map((position) =>
          geographicCoordinateFromEcef(position)
        ),
        markerCoordinates,
      },
      false
    );
    const previewFill = areaPalette.fillCssColor(
      ANNOTATION_TYPE_AREA_VERTICAL,
      false
    );
    const previewPolygonFill = {
      id: `${ANNOTATION_TYPE_AREA_VERTICAL}-draft-preview-fill`,
      coordinates: loopCoordinates
        .slice(0, 4)
        .map((position) => geographicCoordinateFromEcef(position)),
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
    areaLabelController.setState(
      resolveAreaLabelScreenState(
        engine,
        buildVerticalAreaPreviewAreaLabel({ loopCoordinates, formatOptions })
      )
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
