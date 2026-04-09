import { Cartesian3, SceneTransforms, defined } from "@carma-cesium";
import { formatLengthMeters } from "@carma-units";
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
import { distanceToolVisualDefaults } from "./distanceToolVisualDefaults";
import {
  applyLineLabel,
  applyLineRuntime,
  buildPreviewDistanceTriangleLabelReferences,
  buildAuxiliaryPoint,
  clearLineRuntime,
  coordinatesEqual,
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
} from "../../interaction/previewController.shared";

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

export const createDistanceToolPreviewController = ({
  toolType,
  context,
}: {
  toolType: string;
  context: AnnotationToolPreviewContext;
}): AnnotationToolPreviewController | null => {
  const {
    scene,
    annotationsStore,
    formatOptions,
    previewLineLabelVisualOptions,
  } = context;
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
  let hoverSample: AnnotationToolPreviewSample | null = null;
  let previousVerticalLabelOutsideSign: -1 | 1 | undefined;
  let draftCoordinates = [
    ...getDraftCoordinatesForTool(
      annotationsStore.getState().draftState,
      toolType
    ),
  ];

  const hide = () => {
    clearLineRuntime(lines.direct);
    clearLineRuntime(lines.vertical);
    clearLineRuntime(lines.horizontal);
    hidePreviewOverlayLine(overlayLines.direct);
    hidePreviewOverlayLine(overlayLines.vertical);
    hidePreviewOverlayLine(overlayLines.horizontal);
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

    const anchorPointECEF =
      cartesian3FromGeographicCoordinate(anchorCoordinate);
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
      previewControllerDefaults.geometryEpsilonMeters
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
      applyPreviewOverlayLine({
        line: overlayLines.direct,
        start: anchorScreenPosition,
        end: hoverScreenPosition,
      });
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

      if (defined(anchorScreenPosition) && defined(auxiliaryScreenPosition)) {
        applyPreviewOverlayLine({
          line: overlayLines.vertical,
          start: anchorScreenPosition,
          end: auxiliaryScreenPosition,
        });
      }

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
          flipReadingDirection: true,
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

      if (defined(auxiliaryScreenPosition) && defined(hoverScreenPosition)) {
        applyPreviewOverlayLine({
          line: overlayLines.horizontal,
          start: auxiliaryScreenPosition,
          end: hoverScreenPosition,
        });
      }

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
