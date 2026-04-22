import { isValidScene } from "@carma-mapping/engines/cesium/core";

import { type CesiumGeographicCoordinate } from "@carma-mapping/annotations/runtime";
import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationToolId } from "@carma-mapping/annotations/runtime";
import { areCoordinateListsEqual } from "@carma-mapping/annotations/runtime";
import { distanceToolVisualDefaults } from "./distance-tool-visual-defaults";
import {
  applyLineLabel,
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  previewControllerDefaults,
  createPreviewOverlayLayer,
} from "@carma-mapping/annotations/runtime";
import { resolveSegmentGuideFrame } from "@carma-mapping/annotations/runtime";

const DISTANCE_PREVIEW_LAYER_ID = "annotation-overlay-distance-preview-layer";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type PreviewOverlayLines = {
  root: SVGSVGElement;
  direct: SVGLineElement;
  vertical: SVGLineElement;
  horizontal: SVGLineElement;
};

const createPreviewOverlayLine = (stroke: string) => {
  const line = document.createElementNS(SVG_NAMESPACE, "line");
  line.setAttribute("stroke", stroke);
  line.setAttribute(
    "stroke-width",
    `${distanceToolVisualDefaults.dashedLine.strokeWidthPx}`
  );
  line.setAttribute(
    "stroke-dasharray",
    distanceToolVisualDefaults.dashedLine.dashPattern
  );
  line.setAttribute("stroke-linecap", "round");
  line.style.display = "none";
  return line;
};

const createPreviewOverlayLines = (): PreviewOverlayLines => {
  const root = document.createElementNS(SVG_NAMESPACE, "svg");
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.overflow = "visible";
  root.style.pointerEvents = "none";

  const direct = createPreviewOverlayLine(
    previewControllerDefaults.directLineColor
  );
  const vertical = createPreviewOverlayLine(
    previewControllerDefaults.verticalLineColor
  );
  const horizontal = createPreviewOverlayLine(
    previewControllerDefaults.horizontalLineColor
  );
  root.append(direct, vertical, horizontal);

  return {
    root,
    direct,
    vertical,
    horizontal,
  };
};

const hidePreviewOverlayLine = (line: SVGLineElement) => {
  line.style.display = "none";
};

const applyPreviewOverlayLine = ({
  line,
  start,
  end,
}: {
  line: SVGLineElement;
  start: { x: number; y: number };
  end: { x: number; y: number };
}) => {
  line.setAttribute("x1", `${start.x}`);
  line.setAttribute("y1", `${start.y}`);
  line.setAttribute("x2", `${end.x}`);
  line.setAttribute("y2", `${end.y}`);
  line.style.display = "block";
};

export const createDistanceAuthoringController = ({
  toolType,
  context,
}: {
  toolType: AnnotationToolId;
  context: AnnotationToolAuthoringContext;
}): AnnotationToolAuthoringController | null => {
  const { scene, drafts, formatOptions, previewLineLabelVisualOptions } =
    context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const overlayLayer = createPreviewOverlayLayer(
    scene,
    DISTANCE_PREVIEW_LAYER_ID
  );
  if (!overlayLayer) {
    return null;
  }

  const overlayLines = createPreviewOverlayLines();
  overlayLayer.appendChild(overlayLines.root);

  const lineLabels = createSegmentLineLabels(previewLineLabelVisualOptions);
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal
  );

  const lineCollection = createLineCollection(scene);
  const lines = {
    direct: createLineRuntime(
      lineCollection,
      "distance-preview-direct",
      previewControllerDefaults.directLineColor,
      {
        width: distanceToolVisualDefaults.dashedLine.strokeWidthPx,
      }
    ),
    vertical: createLineRuntime(
      lineCollection,
      "distance-preview-vertical",
      previewControllerDefaults.verticalLineColor,
      {
        width: distanceToolVisualDefaults.dashedLine.strokeWidthPx,
      }
    ),
    horizontal: createLineRuntime(
      lineCollection,
      "distance-preview-horizontal",
      previewControllerDefaults.horizontalLineColor,
      {
        width: distanceToolVisualDefaults.dashedLine.strokeWidthPx,
      }
    ),
  };
  const scratch = createPreviewSegmentScratch();

  let enabled = false;
  let pointQueryPickResult: PointQueryPickResult | null = null;
  let previousVerticalLabelOutsideSign: -1 | 1 | undefined;
  let draftCoordinates = [...drafts.get(toolType).coordinates];

  const hide = (resetVerticalOutsideSign = true) => {
    clearLineRuntime(lines.direct);
    clearLineRuntime(lines.vertical);
    clearLineRuntime(lines.horizontal);
    hidePreviewOverlayLine(overlayLines.direct);
    hidePreviewOverlayLine(overlayLines.vertical);
    hidePreviewOverlayLine(overlayLines.horizontal);
    hideLineLabels(lineLabels);
    if (resetVerticalOutsideSign) {
      previousVerticalLabelOutsideSign = undefined;
    }
  };

  const resolveAnchorCoordinate = (): CesiumGeographicCoordinate | null =>
    draftCoordinates[draftCoordinates.length - 1] ?? null;

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    if (!enabled) {
      hide();
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    hide(false);
    const currentPointQueryPickResult = pointQueryPickResult;
    const hoverCoordinate = currentPointQueryPickResult?.coordinate ?? null;
    const frame = resolveSegmentGuideFrame({
      scene,
      anchorCoordinate: resolveAnchorCoordinate(),
      hoverCoordinate,
      hoverPointECEF: currentPointQueryPickResult?.pointECEF ?? null,
      hoverScreenPosition: currentPointQueryPickResult?.screenPosition ?? null,
      formatOptions,
      previousVerticalOutsideSign: previousVerticalLabelOutsideSign,
      scratch,
    });

    if (!frame) {
      previousVerticalLabelOutsideSign = undefined;
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }
    previousVerticalLabelOutsideSign = frame.nextVerticalOutsideSign;

    applyLineRuntime(lines.direct, [
      frame.direct.startECEF,
      frame.direct.endECEF,
    ]);

    if (frame.direct.startScreen && frame.direct.endScreen) {
      applyPreviewOverlayLine({
        line: overlayLines.direct,
        start: frame.direct.startScreen,
        end: frame.direct.endScreen,
      });
      applyLineLabel({
        element: lineLabels.direct,
        text: frame.direct.labelText ?? "",
        start: frame.direct.startScreen,
        end: frame.direct.endScreen,
        outsideReferencePoint: frame.direct.outsideReferencePoint,
      });
    }

    if (frame.vertical) {
      applyLineRuntime(lines.vertical, [
        frame.vertical.startECEF,
        frame.vertical.endECEF,
      ]);

      if (frame.vertical.startScreen && frame.vertical.endScreen) {
        applyPreviewOverlayLine({
          line: overlayLines.vertical,
          start: frame.vertical.startScreen,
          end: frame.vertical.endScreen,
        });
      }

      if (
        frame.vertical.labelText &&
        frame.vertical.startScreen &&
        frame.vertical.endScreen
      ) {
        applyLineLabel({
          element: lineLabels.vertical,
          text: frame.vertical.labelText,
          start: frame.vertical.startScreen,
          end: frame.vertical.endScreen,
          outsideReferencePoint: frame.vertical.outsideReferencePoint,
          flipReadingDirection: true,
        });
      } else {
        lineLabels.vertical.style.display = "none";
      }
    }

    if (frame.horizontal) {
      applyLineRuntime(lines.horizontal, [
        frame.horizontal.startECEF,
        frame.horizontal.endECEF,
      ]);

      if (frame.horizontal.startScreen && frame.horizontal.endScreen) {
        applyPreviewOverlayLine({
          line: overlayLines.horizontal,
          start: frame.horizontal.startScreen,
          end: frame.horizontal.endScreen,
        });
      }

      if (
        frame.horizontal.labelText &&
        frame.horizontal.startScreen &&
        frame.horizontal.endScreen
      ) {
        applyLineLabel({
          element: lineLabels.horizontal,
          text: frame.horizontal.labelText,
          start: frame.horizontal.startScreen,
          end: frame.horizontal.endScreen,
          outsideReferencePoint: frame.horizontal.outsideReferencePoint,
        });
      } else {
        lineLabels.horizontal.style.display = "none";
      }
    }

    if (requestRender) {
      scene.requestRender();
    }
  };

  const unsubscribe = drafts.subscribe(toolType, () => {
    const nextDraftCoordinates = drafts.get(toolType).coordinates;
    if (
      areCoordinateListsEqual(draftCoordinates, nextDraftCoordinates)
    ) {
      return;
    }

    draftCoordinates = [...nextDraftCoordinates];
    render();
  });

  const removePostRenderListener = scene.postRender.addEventListener(() => {
    render(false);
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
      hide();
      destroyLineCollection(scene, lineCollection);
      destroyPreviewOverlayLayer(overlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    },
  };
};
