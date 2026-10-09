import type {
  AnnotationGeographicCoordinate,
  DistanceTriangleLineLabelOutsideSigns,
} from "@carma-mapping/annotations/core";

import { isValidAnnotationEngine, type AnnotationEngine } from "../engine";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import {
  applyLineLabel,
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  createAnnotationOverlayLayer,
  createAnnotationGeometryScratch,
  createSegmentLineLabels,
  destroyAnnotationOverlayLayer,
  hideLineLabels,
  annotationOverlayDefaults,
} from "./authoring-visual-runtime";
import { resolveSegmentGuideFrame } from "./resolve-segment-guide-frame";

export type SegmentGuideController = {
  setSegment: (
    anchorCoordinate: AnnotationGeographicCoordinate | null,
    hoverCoordinate: AnnotationGeographicCoordinate | null,
    requestRender?: boolean
  ) => void;
  clear: (requestRender?: boolean) => void;
  destroy: () => void;
};

const SEGMENT_GUIDE_LAYER_ID = "annotation-overlay-segment-preview-layer";

export const createSegmentGuideController = (
  engine: AnnotationEngine,
  {
    formatOptions,
    lineLabelOptions,
  }: {
    formatOptions: AnnotationsRuntimeFormatOptions;
    lineLabelOptions?: PartialAnnotationLineLabelOptions;
  }
): SegmentGuideController => {
  const overlayLayer = createAnnotationOverlayLayer(
    engine,
    SEGMENT_GUIDE_LAYER_ID
  );
  if (!overlayLayer) {
    return {
      setSegment: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const lineLabels = createSegmentLineLabels(lineLabelOptions);
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal
  );
  const lineCollection = createLineCollection(engine);
  const lines = {
    direct: createLineRuntime(
      lineCollection,
      "draft-preview-direct",
      annotationOverlayDefaults.directLineColor
    ),
    vertical: createLineRuntime(
      lineCollection,
      "draft-preview-vertical",
      annotationOverlayDefaults.verticalLineColor
    ),
    horizontal: createLineRuntime(
      lineCollection,
      "draft-preview-horizontal",
      annotationOverlayDefaults.horizontalLineColor
    ),
  };
  const scratch = createAnnotationGeometryScratch();
  let currentAnchorCoordinate: AnnotationGeographicCoordinate | null = null;
  let currentHoverCoordinate: AnnotationGeographicCoordinate | null = null;
  let previousLabelOutsideSigns:
    | DistanceTriangleLineLabelOutsideSigns
    | undefined;

  const hide = (resetOutsideSigns = true) => {
    clearLineRuntime(lines.direct);
    clearLineRuntime(lines.vertical);
    clearLineRuntime(lines.horizontal);
    hideLineLabels(lineLabels);
    if (resetOutsideSigns) {
      previousLabelOutsideSigns = undefined;
    }
  };

  const render = (requestRender = true) => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    hide(false);
    const frame = resolveSegmentGuideFrame({
      engine,
      anchorCoordinate: currentAnchorCoordinate,
      hoverCoordinate: currentHoverCoordinate,
      formatOptions,
      previousOutsideSigns: previousLabelOutsideSigns,
      scratch,
    });

    if (!frame) {
      previousLabelOutsideSigns = undefined;
      if (requestRender) {
        engine.requestRender();
      }
      return;
    }
    previousLabelOutsideSigns = frame.nextOutsideSigns;

    applyLineRuntime(lines.direct, [
      frame.direct.startECEF,
      frame.direct.endECEF,
    ]);

    if (frame.direct.startScreen && frame.direct.endScreen) {
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
      engine.requestRender();
    }
  };

  const removePostRenderListener = engine.subscribePostRender(() => {
    render(false);
  });

  return {
    setSegment: (anchorCoordinate, hoverCoordinate, requestRender = true) => {
      currentAnchorCoordinate = anchorCoordinate;
      currentHoverCoordinate = hoverCoordinate;
      render(requestRender);
    },
    clear: (requestRender = true) => {
      currentAnchorCoordinate = null;
      currentHoverCoordinate = null;
      render(requestRender);
    },
    destroy: () => {
      removePostRenderListener();
      hide();
      lineCollection.destroy();
      destroyAnnotationOverlayLayer(overlayLayer);
      if (!engine.isDestroyed()) {
        engine.requestRender();
      }
    },
  };
};
