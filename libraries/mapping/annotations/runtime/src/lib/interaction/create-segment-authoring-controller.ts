import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../registry";
import type { CesiumGeographicCoordinate } from "../store";
import { formatLengthMeters, type CssPixelPosition } from "@carma-units";
import { SceneTransforms, defined } from "@carma-cesium";
import {
  buildTextOnlyPointLabelOverlayState,
  createTransientPointLabelController,
} from "@carma-providers/label-overlay";
import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";
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
import type { AnnotationToolId } from "@carma-mapping/annotations/core";

const DRAFT_CHAIN_OVERLAY_LAYER_ID =
  "annotation-overlay-draft-chain-preview-layer";
const DRAFT_CHAIN_LABEL_LAYER_ID =
  "annotation-overlay-draft-chain-preview-label-layer";

const toScreenPoint = (
  scene: NonNullable<AnnotationToolAuthoringContext["scene"]>,
  coordinate: CesiumGeographicCoordinate
): CssPixelPosition | null => {
  const screenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    cartesian3FromGeographicCoordinate(coordinate)
  );
  if (!defined(screenPosition)) {
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
  const { scene, drafts, labelOverlay, formatOptions, lineLabelOptions } =
    context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const draftChainController = createPathAuthoringController(scene, {
    overlayLayerId: DRAFT_CHAIN_OVERLAY_LAYER_ID,
    lineId: "draft-preview-chain",
    lineColor: annotationOverlayDefaults.draftChainColor,
    showPointMarkers: true,
    lineOptions: {
      ...lineOptions,
      overlayDashed: true,
    },
  });
  const segmentController = createSegmentGuideController(scene, {
    formatOptions,
    lineLabelOptions,
  });
  const labelOverlayLayer = createAnnotationOverlayLayer(
    scene,
    DRAFT_CHAIN_LABEL_LAYER_ID
  );
  const committedSegmentLabels: HTMLDivElement[] = [];
  const totalLengthLabelController = createTransientPointLabelController({
    labelOverlay,
    overlayId: `${toolType}-draft-total-length-label`,
    requestRender: () => scene.requestRender(),
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
    if (!isValidScene(scene)) {
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

      const startScreenPosition = toScreenPoint(scene, startCoordinate);
      const endScreenPosition = toScreenPoint(scene, endCoordinate);
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
        scene.requestRender();
      }
      return;
    }

    const endCoordinate =
      hoverCoordinate ??
      previewCoordinates[previewCoordinates.length - 1] ??
      null;
    const endScreenPosition = endCoordinate
      ? toScreenPoint(scene, endCoordinate)
      : null;
    if (!endScreenPosition) {
      totalLengthLabelController.setState(null);
      if (requestRender) {
        scene.requestRender();
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
            ? toScreenPoint(scene, nextEndCoordinate)
            : null;
        },
      })
    );
    if (requestRender) {
      scene.requestRender();
    }
  };

  const render = () => {
    if (!enabled) {
      draftChainController.clear();
      segmentController.clear();
      hideCommittedSegmentLabels();
      totalLengthLabelController.setState(null);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

    const hoverCoordinate = pointQueryPickResult?.coordinate ?? null;
    const markerCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];

    draftChainController.setState({
      lineCoordinates: showCommittedDraftChain ? draftCoordinates : [],
      markerCoordinates,
    });
    segmentController.setSegment(
      draftCoordinates[draftCoordinates.length - 1] ?? null,
      hoverCoordinate
    );
    renderLabels();
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
      segmentController.destroy();
      totalLengthLabelController.destroy();
      destroyAnnotationOverlayLayer(labelOverlayLayer);
    },
  };
};
