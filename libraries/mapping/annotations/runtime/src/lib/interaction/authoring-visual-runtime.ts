export { annotationOverlayDefaults } from "../config/annotation-overlay-defaults";
export {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayContainer,
  type AnnotationOverlayGroup,
} from "./annotation-overlay-mount";
export {
  applyStyles,
  createAnnotationOverlayLayer,
  createAnnotationOverlayLayers,
  destroyAnnotationOverlayLayer,
} from "./authoring-overlay-layer";
export {
  applyLineRuntime,
  clearLineRuntime,
  createLineCollection,
  createLineRuntime,
  setLineRuntimeColor,
  type AuthoringLineRuntime,
} from "./authoring-line-runtime";
export {
  applyLineLabel,
  createLineLabel,
  createSegmentLineLabels,
  hideLineLabels,
  type AuthoringSegmentLineLabels,
} from "./authoring-line-label";
export { createAreaLabelController } from "./authoring-area-label";
export { hidePointMarkers, placePointMarkers } from "./authoring-point-markers";
export {
  buildAuxiliaryPoint,
  buildVerticalAreaLoopCoordinates,
  createAnnotationGeometryScratch,
  resolveDistanceTriangleComponentLabelVisibility,
  type AnnotationGeometryScratch,
} from "./authoring-geometry";
