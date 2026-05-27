import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import { isValidScene } from "@carma-mapping/engines/cesium/core";

import { type CesiumGeographicCoordinate } from "@carma-mapping/annotations/runtime";
import type {
  AnnotationToolAuthoringController,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "@carma-mapping/annotations/runtime";
import { areCoordinateListsEqual } from "@carma-mapping/annotations/runtime";
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
  hidePointMarkers,
  placePointMarkers,
  previewControllerDefaults,
  createPreviewOverlayLayer,
} from "@carma-mapping/annotations/runtime";
import { resolveSegmentGuideFrame } from "@carma-mapping/annotations/runtime";
import {
  resolveMeasurementLineStyleOptions,
  type MeasurementLineStyleOptions,
  type ResolvedMeasurementLineStyleOptions,
} from "@carma-mapping/annotations/runtime";

const DISTANCE_PREVIEW_LAYER_ID = "annotation-overlay-distance-preview-layer";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type PreviewOverlayLines = {
  root: SVGSVGElement;
  direct: SVGLineElement;
  vertical: SVGLineElement;
  horizontal: SVGLineElement;
};

const createPreviewOverlayLine = (
  stroke: string,
  lineStyleOptions: ResolvedMeasurementLineStyleOptions
) => {
  const line = document.createElementNS(SVG_NAMESPACE, "line");
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", `${lineStyleOptions.strokeWidthPx}`);
  line.setAttribute("stroke-dasharray", lineStyleOptions.overlayDashPattern);
  line.setAttribute("stroke-linecap", "round");
  line.style.display = "none";
  return line;
};

const createPreviewOverlayLines = (
  lineStyleOptions: ResolvedMeasurementLineStyleOptions
): PreviewOverlayLines => {
  const root = document.createElementNS(SVG_NAMESPACE, "svg");
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.overflow = "visible";
  root.style.pointerEvents = "none";

  const direct = createPreviewOverlayLine(
    previewControllerDefaults.directLineColor,
    lineStyleOptions
  );
  const vertical = createPreviewOverlayLine(
    previewControllerDefaults.verticalLineColor,
    lineStyleOptions
  );
  const horizontal = createPreviewOverlayLine(
    previewControllerDefaults.horizontalLineColor,
    lineStyleOptions
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
  measurementLineStyleOptions,
}: {
  toolType: AnnotationToolId;
  context: AnnotationToolAuthoringContext;
  measurementLineStyleOptions?: MeasurementLineStyleOptions;
}): AnnotationToolAuthoringController | null => {
  const { scene, drafts, formatOptions, lineLabelOptions } =
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

  const resolvedLineStyleOptions = resolveMeasurementLineStyleOptions(
    measurementLineStyleOptions
  );
  const overlayLines = createPreviewOverlayLines(resolvedLineStyleOptions);
  overlayLayer.appendChild(overlayLines.root);

  const lineLabels = createSegmentLineLabels(lineLabelOptions);
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal
  );
  const pointMarkers: HTMLDivElement[] = [];

  const lineCollection = createLineCollection(scene);
  const lines = {
    direct: createLineRuntime(
      lineCollection,
      "distance-preview-direct",
      previewControllerDefaults.directLineColor,
      {
        width: resolvedLineStyleOptions.strokeWidthPx,
      }
    ),
    vertical: createLineRuntime(
      lineCollection,
      "distance-preview-vertical",
      previewControllerDefaults.verticalLineColor,
      {
        width: resolvedLineStyleOptions.strokeWidthPx,
      }
    ),
    horizontal: createLineRuntime(
      lineCollection,
      "distance-preview-horizontal",
      previewControllerDefaults.horizontalLineColor,
      {
        width: resolvedLineStyleOptions.strokeWidthPx,
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
    hidePointMarkers(pointMarkers);
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
    const markerCoordinates = hoverCoordinate
      ? [...draftCoordinates, hoverCoordinate]
      : [...draftCoordinates];
    if (markerCoordinates.length > 0) {
      placePointMarkers({
        scene,
        overlayLayer,
        pointMarkers,
        coordinates: markerCoordinates,
      });
    }

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
    if (areCoordinateListsEqual(draftCoordinates, nextDraftCoordinates)) {
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
