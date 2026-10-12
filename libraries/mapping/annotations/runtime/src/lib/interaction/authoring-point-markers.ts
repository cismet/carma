import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type { AnnotationGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  annotationVisualStyles,
  type PointMarkerVisualStyle,
} from "../config/annotation-visual-defaults";
import type { AnnotationEngine } from "../engine";
import { applyStyles } from "./authoring-overlay-layer";

const applyPointMarkerVisualStyle = (
  marker: HTMLDivElement,
  style: PointMarkerVisualStyle
) => {
  applyStyles(marker, {
    width: `${style.pixelSize}px`,
    height: `${style.pixelSize}px`,
    border: `${style.outlineWidth}px solid ${style.outline}`,
    background: style.fill,
  });
};

const createPointMarker = (style: PointMarkerVisualStyle) => {
  const marker = document.createElement("div");
  applyStyles(marker, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    borderRadius: "999px",
    transform: "translate(-50%, -50%)",
    boxSizing: "border-box",
    pointerEvents: "none",
    userSelect: "none",
    webkitUserSelect: "none",
    willChange: "transform",
  });
  applyPointMarkerVisualStyle(marker, style);
  return marker;
};

export const hidePointMarkers = (pointMarkers: readonly HTMLDivElement[]) => {
  pointMarkers.forEach((pointMarker) => {
    pointMarker.style.display = "none";
  });
};

export const placePointMarkers = ({
  engine,
  overlayLayer,
  pointMarkers,
  coordinates,
  style = annotationVisualStyles.point,
}: {
  engine: AnnotationEngine;
  overlayLayer: HTMLElement;
  pointMarkers: HTMLDivElement[];
  coordinates: readonly AnnotationGeographicCoordinate[];
  style?: PointMarkerVisualStyle;
}) => {
  while (pointMarkers.length < coordinates.length) {
    const marker = createPointMarker(style);
    pointMarkers.push(marker);
    overlayLayer.appendChild(marker);
  }

  coordinates.forEach((coordinate, index) => {
    const marker = pointMarkers[index];
    if (!marker) {
      return;
    }

    applyPointMarkerVisualStyle(marker, style);
    const screenPosition = engine.worldToScreen(
      ecefFromGeographicCoordinate(coordinate)
    );
    if (!screenPosition) {
      marker.style.display = "none";
      return;
    }

    marker.style.display = "block";
    marker.style.transform = `translate(${Math.round(
      screenPosition.x
    )}px, ${Math.round(screenPosition.y)}px) translate(-50%, -50%)`;
  });

  hidePointMarkers(pointMarkers.slice(coordinates.length));
};
