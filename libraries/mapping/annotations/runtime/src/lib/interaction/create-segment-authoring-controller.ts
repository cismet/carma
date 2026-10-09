import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry";
import { formatLengthMeters, type CssPixelPosition } from "@carma-units";
import {
  buildTextOnlyPointLabelOverlayState,
  createTransientPointLabelController,
} from "@carma-providers/label-overlay";
import {
  ecefFromGeographicCoordinate,
  type AnnotationGeographicCoordinate,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import { isValidAnnotationEngine } from "../engine";
import { areCoordinateListsEqual } from "../utils/coordinate-equality";
import {
  createPathAuthoringController,
  type PathAuthoringLineOptions,
} from "./create-path-authoring-controller";
import { createSegmentGuideController } from "./create-segment-guide-controller";
import {
  applyLineLabel,
  createLineLabel,
  createAnnotationOverlayLayer,
  destroyAnnotationOverlayLayer,
  annotationOverlayDefaults,
} from "./authoring-visual-runtime";
import {
  computePolylineSegmentLengthsMeters,
  computePolylineTotalLengthMeters,
} from "../utils/measurement-summaries";
import { resolveAnnotationLineLabelOptions } from "../config/annotation-line-label-options";

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const DRAFT_CHAIN_LABEL_LAYER_ID =
  "annotation-overlay-draft-chain-preview-label-layer";

const toScreenPoint = (
  engine: NonNullable<AnnotationToolAuthoringContext["engine"]>,
  coordinate: AnnotationGeographicCoordinate
): CssPixelPosition | null => {
  const screenPosition = engine.worldToScreen(
    ecefFromGeographicCoordinate(coordinate)
  );
  if (!screenPosition) {
    return null;
  }

  return {
    x: screenPosition.x as CssPixelPosition["x"],
    y: screenPosition.y as CssPixelPosition["y"],
  };
};

export const createSegmentAuthoringController = ({
  toolType,
  context,
  showCommittedDraftChain,
  lineOptions,
}: {
  toolType: AnnotationToolId;
  context: AnnotationToolAuthoringContext;
  showCommittedDraftChain: boolean;
  lineOptions?: PathAuthoringLineOptions;
}): AnnotationToolAuthoringController | null => {
  const { engine, drafts, labelOverlay, formatOptions, lineLabelOptions } =
    context;
  if (!engine || engine.isDestroyed()) {
    return null;
  }

  const draftChainController = createPathAuthoringController(engine, {
    overlayLayerId: DRAFT_CHAIN_OVERLAY_LAYER_ID,
    lineId: "draft-preview-chain",
    lineColor: annotationOverlayDefaults.draftChainColor,
    showPointMarkers: true,
    lineOptions: {
      ...lineOptions,
      overlayDashed: true,
    },
  });
  const segmentController = createSegmentGuideController(engine, {
    formatOptions,
    lineLabelOptions,
  });
  const labelOverlayLayer = createAnnotationOverlayLayer(
    engine,
    DRAFT_CHAIN_LABEL_LAYER_ID
  );
  const committedSegmentLabels: HTMLDivElement[] = [];
  const totalLengthLabelController = createTransientPointLabelController({
    labelOverlay,
    overlayId: `${toolType}-draft-total-length-label`,
  });
  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let draftCoordinates = [...drafts.get(toolType).coordinates];
  const resolvedAnnotationLineLabelOptions =
    resolveAnnotationLineLabelOptions(lineLabelOptions);

  const ensureCommittedSegmentLabelCount = (count: number) => {
    if (!labelOverlayLayer) {
      return;
    }

    while (committedSegmentLabels.length < count) {
      const label = createLineLabel(
        annotationOverlayDefaults.directLineColor,
        lineLabelOptions
      );
      committedSegmentLabels.push(label);
      labelOverlayLayer.appendChild(label);
    }
  };

  const hideCommittedSegmentLabels = (startIndex = 0) => {
    committedSegmentLabels.slice(startIndex).forEach((label) => {
      label.style.display = "none";
    });
  };

  const renderLabels = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const previewCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];
    const committedLabelCoordinates = showCommittedDraftChain
      ? draftCoordinates
      : [];
    const segmentLengthsMeters = computePolylineSegmentLengthsMeters(
      committedLabelCoordinates
    );

    ensureCommittedSegmentLabelCount(segmentLengthsMeters.length);
    segmentLengthsMeters.forEach((segmentLengthMeters, index) => {
      const startCoordinate = committedLabelCoordinates[index];
      const endCoordinate = committedLabelCoordinates[index + 1];
      const label = committedSegmentLabels[index];
      if (!startCoordinate || !endCoordinate || !label) {
        return;
      }

      const startScreenPosition = toScreenPoint(engine, startCoordinate);
      const endScreenPosition = toScreenPoint(engine, endCoordinate);
      if (!startScreenPosition || !endScreenPosition) {
        label.style.display = "none";
        return;
      }

      applyLineLabel({
        element: label,
        text: formatLengthMeters(
          segmentLengthMeters,
          formatOptions.lengthMeters
        ),
        start: startScreenPosition,
        end: endScreenPosition,
      });
    });
    hideCommittedSegmentLabels(segmentLengthsMeters.length);

    if (previewCoordinates.length < 2) {
      totalLengthLabelController.setState(null);
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    const endCoordinate =
      hoverCoordinate ??
      previewCoordinates[previewCoordinates.length - 1] ??
      null;
    const endScreenPosition = endCoordinate
      ? toScreenPoint(engine, endCoordinate)
      : null;
    if (!endScreenPosition) {
      totalLengthLabelController.setState(null);
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }

    totalLengthLabelController.setState(
      buildTextOnlyPointLabelOverlayState({
        text: formatLengthMeters(
          computePolylineTotalLengthMeters(previewCoordinates),
          formatOptions.lengthMeters
        ),
        lineColor: annotationOverlayDefaults.directLineColor,
        theme: resolvedAnnotationLineLabelOptions.appearance.themeStyle,
        fontFamily: resolvedAnnotationLineLabelOptions.text.fontFamily,
        fontWeight: resolvedAnnotationLineLabelOptions.text.fontWeight,
        getScreenPosition: () => {
          const nextEndCoordinate =
            pointQueryPickResult?.coordinate ??
            draftCoordinates[draftCoordinates.length - 1] ??
            null;
          return nextEndCoordinate
            ? toScreenPoint(engine, nextEndCoordinate)
            : null;
        },
      })
    );
    if (requestRender) {
      engine.requestRender();
    }
  };

  const render = (requestRender = true) => {
    if (!enabled) {
      draftChainController.clear(false);
      segmentController.clear(false);
      hideCommittedSegmentLabels();
      totalLengthLabelController.setState(null);
      if (requestRender && !engine.isDestroyed()) {
        engine.requestRender();
      }
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const markerCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];

    draftChainController.setState(
      {
        lineCoordinates: showCommittedDraftChain ? draftCoordinates : [],
        markerCoordinates,
      },
      false
    );
    segmentController.setSegment(
      draftCoordinates[draftCoordinates.length - 1] ?? null,
      hoverCoordinate,
      false
    );
    renderLabels(requestRender);
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
    setPointQueryPickResult: (pickResult, options) => {
      pointQueryPickResult = pickResult;
      render(options?.requestRender);
    },
    destroy: () => {
      unsubscribe();
      draftChainController.destroy();
      segmentController.destroy();
      totalLengthLabelController.destroy();
      destroyAnnotationOverlayLayer(labelOverlayLayer);
    },
  };
};
