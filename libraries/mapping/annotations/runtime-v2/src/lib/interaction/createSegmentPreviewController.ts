import { Cartesian3, SceneTransforms, defined } from "@carma-cesium";
import { formatLengthMeters } from "@carma-units";
import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotationsRuntimeFormatOptions";
import type { PreviewLineLabelVisualOptions } from "../config/previewLineLabelVisualDefaults";
import {
  applyLineLabel,
  applyLineRuntime,
  buildPreviewDistanceTriangleLabelReferences,
  buildAuxiliaryPoint,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  previewControllerDefaults,
} from "./previewController.shared";

export type SegmentPreviewController = {
  setSegment: (
    anchorCoordinate: RuntimeCoordinate | null,
    hoverCoordinate: RuntimeCoordinate | null
  ) => void;
  clear: () => void;
  destroy: () => void;
};

const SEGMENT_PREVIEW_LAYER_ID = "annotation-overlay-segment-preview-layer";

export const createSegmentPreviewController = (
  scene: RuntimeScene,
  {
    formatOptions,
    previewLineLabelVisualOptions,
  }: {
    formatOptions: AnnotationsRuntimeFormatOptions;
    previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  }
): SegmentPreviewController => {
  const overlayLayer = createPreviewOverlayLayer(
    scene,
    SEGMENT_PREVIEW_LAYER_ID
  );
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

  const hide = () => {
    clearLineRuntime(lines.direct);
    clearLineRuntime(lines.vertical);
    clearLineRuntime(lines.horizontal);
    hideLineLabels(lineLabels);
    previousVerticalLabelOutsideSign = undefined;
  };

  const render = (requestRender = true) => {
    if (!isValidScene(scene)) {
      return;
    }

    const anchorCoordinate = currentAnchorCoordinate;
    const hoverCoordinate = currentHoverCoordinate;
    if (!anchorCoordinate || !hoverCoordinate) {
      hide();
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    const anchorPointECEF =
      cartesian3FromGeographicCoordinate(anchorCoordinate);
    const hoverPointECEF = cartesian3FromGeographicCoordinate(hoverCoordinate);

    hide();

    if (
      Cartesian3.distance(anchorPointECEF, hoverPointECEF) <=
      previewControllerDefaults.geometryEpsilonMeters
    ) {
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    const anchorScreenPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      anchorPointECEF
    );
    const hoverScreenPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      hoverPointECEF
    );

    const auxiliaryPoint = buildAuxiliaryPoint({
      scene,
      anchorPointECEF,
      targetPointECEF: hoverPointECEF,
      scratch,
    });
    if (!auxiliaryPoint) {
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    const auxiliaryScreenPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      auxiliaryPoint,
      scratch.auxiliaryScreen
    );
    const labelReferences =
      defined(anchorScreenPosition) &&
      defined(hoverScreenPosition) &&
      defined(auxiliaryScreenPosition)
        ? buildPreviewDistanceTriangleLabelReferences({
            anchor: anchorScreenPosition,
            target: hoverScreenPosition,
            aux: auxiliaryScreenPosition,
            anchorAltitudeMeters: anchorCoordinate.altitude,
            targetAltitudeMeters: hoverCoordinate.altitude,
            previousVerticalOutsideSign: previousVerticalLabelOutsideSign,
          })
        : null;
    previousVerticalLabelOutsideSign = labelReferences?.nextVerticalOutsideSign;

    const directLabelText = formatLengthMeters(
      Cartesian3.distance(anchorPointECEF, hoverPointECEF),
      formatOptions.lengthMeters
    );
    const verticalLabelText =
      Cartesian3.distance(anchorPointECEF, auxiliaryPoint) >
      previewControllerDefaults.geometryEpsilonMeters
        ? formatLengthMeters(
            Cartesian3.distance(anchorPointECEF, auxiliaryPoint),
            formatOptions.lengthMeters
          )
        : null;
    const horizontalLabelText =
      Cartesian3.distance(auxiliaryPoint, hoverPointECEF) >
      previewControllerDefaults.geometryEpsilonMeters
        ? formatLengthMeters(
            Cartesian3.distance(auxiliaryPoint, hoverPointECEF),
            formatOptions.lengthMeters
          )
        : null;
    const componentLabelVisibility =
      resolvePreviewDistanceTriangleComponentLabelVisibility({
        directLabelText,
        verticalLabelText,
        horizontalLabelText,
      });

    applyLineRuntime(lines.direct, [anchorPointECEF, hoverPointECEF]);

    if (defined(anchorScreenPosition) && defined(hoverScreenPosition)) {
      applyLineLabel({
        element: lineLabels.direct,
        text: directLabelText,
        start: anchorScreenPosition,
        end: hoverScreenPosition,
        outsideReferencePoint:
          labelReferences?.directOutsideReferencePoint ?? null,
      });
    }

    if (
      Cartesian3.distance(anchorPointECEF, auxiliaryPoint) >
      previewControllerDefaults.geometryEpsilonMeters
    ) {
      applyLineRuntime(lines.vertical, [anchorPointECEF, auxiliaryPoint]);

      if (
        componentLabelVisibility.showVerticalLabel &&
        defined(anchorScreenPosition) &&
        defined(auxiliaryScreenPosition) &&
        verticalLabelText
      ) {
        applyLineLabel({
          element: lineLabels.vertical,
          text: verticalLabelText,
          start: anchorScreenPosition,
          end: auxiliaryScreenPosition,
          outsideReferencePoint:
            labelReferences?.verticalOutsideReferencePoint ?? null,
        });
      } else {
        lineLabels.vertical.style.display = "none";
      }
    }

    if (
      Cartesian3.distance(auxiliaryPoint, hoverPointECEF) >
      previewControllerDefaults.geometryEpsilonMeters
    ) {
      applyLineRuntime(lines.horizontal, [auxiliaryPoint, hoverPointECEF]);

      if (
        componentLabelVisibility.showHorizontalLabel &&
        defined(auxiliaryScreenPosition) &&
        defined(hoverScreenPosition) &&
        horizontalLabelText
      ) {
        applyLineLabel({
          element: lineLabels.horizontal,
          text: horizontalLabelText,
          start: auxiliaryScreenPosition,
          end: hoverScreenPosition,
          outsideReferencePoint:
            labelReferences?.horizontalOutsideReferencePoint ?? null,
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
