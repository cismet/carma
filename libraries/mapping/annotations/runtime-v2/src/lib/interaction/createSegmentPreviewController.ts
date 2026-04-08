import {
  Cartesian3,
  SceneTransforms,
  defined,
} from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
import {
  DIRECT_LINE_COLOR,
  HORIZONTAL_LINE_COLOR,
  PREVIEW_GEOMETRY_EPSILON_METERS,
  VERTICAL_LINE_COLOR,
  applyLineLabel,
  applyLineRuntime,
  buildPreviewDistanceTriangleLabelReferences,
  buildAuxiliaryPoint,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  formatMeters,
  hideLineLabels,
} from "./previewController.shared";

export type SegmentPreviewController = {
  setSegment: (
    anchorCoordinate: RuntimeCoordinate | null,
    hoverCoordinate: RuntimeCoordinate | null
  ) => void;
  clear: () => void;
  destroy: () => void;
};

const SEGMENT_PREVIEW_LAYER_ID = "annotation-v2-segment-preview-layer";

export const createSegmentPreviewController = (
  scene: RuntimeScene
): SegmentPreviewController => {
  const overlayLayer = createPreviewOverlayLayer(scene, SEGMENT_PREVIEW_LAYER_ID);
  if (!overlayLayer) {
    return {
      setSegment: () => undefined,
      clear: () => undefined,
      destroy: () => undefined,
    };
  }

  const lineLabels = createSegmentLineLabels();
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal
  );
  const lineCollection = createLineCollection(scene);
  const lines = {
    direct: createLineRuntime(lineCollection, "draft-preview-direct", DIRECT_LINE_COLOR),
    vertical: createLineRuntime(
      lineCollection,
      "draft-preview-vertical",
      VERTICAL_LINE_COLOR
    ),
    horizontal: createLineRuntime(
      lineCollection,
      "draft-preview-horizontal",
      HORIZONTAL_LINE_COLOR
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

    const anchorPointECEF = cartesian3FromGeographicCoordinate(anchorCoordinate);
    const hoverPointECEF = cartesian3FromGeographicCoordinate(hoverCoordinate);

    hide();

    if (
      Cartesian3.distance(anchorPointECEF, hoverPointECEF) <=
      PREVIEW_GEOMETRY_EPSILON_METERS
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
    previousVerticalLabelOutsideSign =
      labelReferences?.nextVerticalOutsideSign;

    applyLineRuntime(lines.direct, [anchorPointECEF, hoverPointECEF]);

    if (defined(anchorScreenPosition) && defined(hoverScreenPosition)) {
      applyLineLabel({
        element: lineLabels.direct,
        text: formatMeters(Cartesian3.distance(anchorPointECEF, hoverPointECEF)),
        start: anchorScreenPosition,
        end: hoverScreenPosition,
        outsideReferencePoint:
          labelReferences?.directOutsideReferencePoint ?? null,
      });
    }

    if (
      Cartesian3.distance(anchorPointECEF, auxiliaryPoint) >
      PREVIEW_GEOMETRY_EPSILON_METERS
    ) {
      applyLineRuntime(lines.vertical, [anchorPointECEF, auxiliaryPoint]);

      if (defined(anchorScreenPosition) && defined(auxiliaryScreenPosition)) {
        applyLineLabel({
          element: lineLabels.vertical,
          text: formatMeters(Cartesian3.distance(anchorPointECEF, auxiliaryPoint)),
          start: anchorScreenPosition,
          end: auxiliaryScreenPosition,
          outsideReferencePoint:
            labelReferences?.verticalOutsideReferencePoint ?? null,
        });
      }
    }

    if (
      Cartesian3.distance(auxiliaryPoint, hoverPointECEF) >
      PREVIEW_GEOMETRY_EPSILON_METERS
    ) {
      applyLineRuntime(lines.horizontal, [auxiliaryPoint, hoverPointECEF]);

      if (defined(auxiliaryScreenPosition) && defined(hoverScreenPosition)) {
        applyLineLabel({
          element: lineLabels.horizontal,
          text: formatMeters(Cartesian3.distance(auxiliaryPoint, hoverPointECEF)),
          start: auxiliaryScreenPosition,
          end: hoverScreenPosition,
          outsideReferencePoint:
            labelReferences?.horizontalOutsideReferencePoint ?? null,
        });
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
