import {
  Cartesian3,
  SceneTransforms,
  defined,
} from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";

import {
  getDraftCoordinatesForTool,
  type RuntimeCoordinate,
} from "../../store";
import type {
  AnnotationToolPreviewController,
  AnnotationToolPreviewContext,
  AnnotationToolPreviewSample,
} from "../annotationToolPlugin.types";
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
  coordinatesEqual,
  createLineCollection,
  createLineRuntime,
  createPreviewOverlayLayer,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyLineCollection,
  destroyPreviewOverlayLayer,
  formatMeters,
  hideLineLabels,
} from "../../interaction/previewController.shared";

const DISTANCE_PREVIEW_LAYER_ID = "annotation-v2-distance-preview-layer";

export const createDistanceToolPreviewController = ({
  toolType,
  context,
}: {
  toolType: string;
  context: AnnotationToolPreviewContext;
}): AnnotationToolPreviewController | null => {
  const { scene, annotationsStore } = context;
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const overlayLayer = createPreviewOverlayLayer(scene, DISTANCE_PREVIEW_LAYER_ID);
  if (!overlayLayer) {
    return null;
  }

  const lineLabels = createSegmentLineLabels();
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
      DIRECT_LINE_COLOR
    ),
    vertical: createLineRuntime(
      lineCollection,
      "distance-preview-vertical",
      VERTICAL_LINE_COLOR
    ),
    horizontal: createLineRuntime(
      lineCollection,
      "distance-preview-horizontal",
      HORIZONTAL_LINE_COLOR
    ),
  };
  const scratch = createPreviewSegmentScratch();

  let enabled = false;
  let hoverSample: AnnotationToolPreviewSample | null = null;
  let previousVerticalLabelOutsideSign: -1 | 1 | undefined;
  let draftCoordinates = [
    ...getDraftCoordinatesForTool(annotationsStore.getState().draftState, toolType),
  ];

  const hide = () => {
    clearLineRuntime(lines.direct);
    clearLineRuntime(lines.vertical);
    clearLineRuntime(lines.horizontal);
    hideLineLabels(lineLabels);
    previousVerticalLabelOutsideSign = undefined;
  };

  const resolveAnchorCoordinate = (): RuntimeCoordinate | null =>
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

    const anchorCoordinate = resolveAnchorCoordinate();
    const currentHoverSample = hoverSample;
    const hoverCoordinate = currentHoverSample?.coordinate ?? null;

    if (!anchorCoordinate || !hoverCoordinate) {
      hide();
      if (requestRender) {
        scene.requestRender();
      }
      return;
    }

    const anchorPointECEF = cartesian3FromGeographicCoordinate(anchorCoordinate);
    const hoverPointECEF =
      currentHoverSample?.pointECEF ??
      cartesian3FromGeographicCoordinate(hoverCoordinate);
    const anchorScreenPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      anchorPointECEF
    );
    const hoverScreenPosition =
      currentHoverSample?.screenPosition ??
      SceneTransforms.worldToWindowCoordinates(scene, hoverPointECEF);

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

  const unsubscribe = annotationsStore.subscribe(() => {
    const nextDraftCoordinates = getDraftCoordinatesForTool(
      annotationsStore.getState().draftState,
      toolType
    );
    if (coordinatesEqual(draftCoordinates, nextDraftCoordinates)) {
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
        hoverSample = null;
      }
      render();
    },
    setHoverSample: (sample) => {
      hoverSample = sample;
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
