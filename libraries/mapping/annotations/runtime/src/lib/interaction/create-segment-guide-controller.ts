import { isValidScene } from "@carma-mapping/engines/cesium/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtime-scene.types";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import {
  applyLineLabel,
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  previewControllerDefaults,
} from "./authoring-visual-runtime";
import { resolveSegmentGuideFrame } from "./resolve-segment-guide-frame";

export type SegmentGuideController = {
  setSegment: (
    anchorCoordinate: RuntimeCoordinate | null,
    hoverCoordinate: RuntimeCoordinate | null
  ) => void;
  clear: () => void;
  destroy: () => void;
};

const SEGMENT_GUIDE_LAYER_ID = "annotation-overlay-segment-preview-layer";

export const createSegmentGuideController = (
  scene: RuntimeScene,
  {
    formatOptions,
    previewLineLabelVisualOptions,
  }: {
    formatOptions: AnnotationsRuntimeFormatOptions;
    previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  }
): SegmentGuideController => {
  const overlayLayer = createPreviewOverlayLayer(scene, SEGMENT_GUIDE_LAYER_ID);
  if (!overlayLayer) {
    return {
      setSegment: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

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
      "draft-preview-direct",
      previewControllerDefaults.directLineColor
    ),
    vertical: createLineRuntime(
      lineCollection,
      "draft-preview-vertical",
      previewControllerDefaults.verticalLineColor
    ),
    horizontal: createLineRuntime(
      lineCollection,
      "draft-preview-horizontal",
      previewControllerDefaults.horizontalLineColor
    ),
  };
  const scratch = createPreviewSegmentScratch();
  let currentAnchorCoordinate: RuntimeCoordinate | null = null;
  let currentHoverCoordinate: RuntimeCoordinate | null = null;
  let previousVerticalLabelOutsideSign: -1 | 1 | undefined;

  const hide = (resetVerticalOutsideSign = true) => {
    clearLineRuntime(lines.direct);
    clearLineRuntime(lines.vertical);
    clearLineRuntime(lines.horizontal);
    hideLineLabels(lineLabels);
    if (resetVerticalOutsideSign) {
      previousVerticalLabelOutsideSign = undefined;
    }
  };

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    hide(false);
    const frame = resolveSegmentGuideFrame({
      scene,
      anchorCoordinate: currentAnchorCoordinate,
      hoverCoordinate: currentHoverCoordinate,
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
      scene.requestRender();
    }
  };

  const removePostRenderListener = scene.postRender.addEventListener(() => {
    render(false);
  });

  return {
    setSegment: (anchorCoordinate, hoverCoordinate) => {
      currentAnchorCoordinate = anchorCoordinate;
      currentHoverCoordinate = hoverCoordinate;
      render();
    },
    clear: () => {
      currentAnchorCoordinate = null;
      currentHoverCoordinate = null;
      render();
    },
    destroy: () => {
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
