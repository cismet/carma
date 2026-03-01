import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Cartesian2, Cartesian3, type Scene } from "@carma/cesium";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
  type PlanarPolygonGroup,
} from "../types/AnnotationTypes";

export type AnnotationLivePreviewType =
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_NONE
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POINT
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR
  | typeof ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;

export const ANNOTATION_LIVE_PREVIEW_TYPE_NONE = "none";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POINT = "point";
export const ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE = "distance";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE = "polyline";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND = "polygon-ground";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR = "polygon-planar";
export const ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL = "polygon-vertical";

export type AnnotationLivePreviewDescriptor = {
  type: AnnotationLivePreviewType;
  verticalOffsetMeters: number;
  verticalPolygonContext?: {
    groupId: string;
    firstVertexPointId: string;
  };
};

type UseAnnotationLivePreviewStateParams = {
  scene: Scene | null;
  activePreview: AnnotationLivePreviewDescriptor;
  pointQueryEnabled: boolean;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  measurements: AnnotationCollection;
  setPlanarPolygonGroups: Dispatch<SetStateAction<PlanarPolygonGroup[]>>;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
  getFacadeRectanglePreviewAreaSquareMeters: (
    firstVertexECEF: Cartesian3,
    oppositeVertexECEF: Cartesian3
  ) => number;
};

type UseAnnotationLivePreviewStateResult = {
  livePreviewPointECEF: Cartesian3 | null;
  livePreviewSurfaceNormalECEF: Cartesian3 | null;
  livePreviewVerticalOffsetAnchorECEF: Cartesian3 | null;
  handlePointQueryPointerMove: (
    positionECEF: Cartesian3 | null,
    screenPosition?: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
  previewIsPolylineCreateMode: boolean;
  hasActivePreviewNode: boolean;
  activePreviewSupportsDistanceLine: boolean;
  activePreviewUsesPolylineDistanceRules: boolean;
  activePreviewForceDirectDistanceLine: boolean;
  isLivePointPreviewModeActive: boolean;
};

export const useAnnotationLivePreviewState = ({
  scene,
  activePreview,
  pointQueryEnabled,
  moveGizmoPointId,
  isMoveGizmoDragging,
  measurements,
  setPlanarPolygonGroups,
  getPositionWithVerticalOffsetFromAnchor,
  getFacadeRectanglePreviewAreaSquareMeters,
}: UseAnnotationLivePreviewStateParams): UseAnnotationLivePreviewStateResult => {
  const [livePreviewPointECEF, setLivePreviewPointECEF] =
    useState<Cartesian3 | null>(null);
  const [livePreviewSurfaceNormalECEF, setLivePreviewSurfaceNormalECEF] =
    useState<Cartesian3 | null>(null);
  const [
    livePreviewVerticalOffsetAnchorECEF,
    setLivePreviewVerticalOffsetAnchorECEF,
  ] = useState<Cartesian3 | null>(null);

  const previewIsPolylineCreateMode =
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE;
  const isVerticalPolygon =
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;
  const hasActivePreviewNode =
    activePreview.type !== ANNOTATION_LIVE_PREVIEW_TYPE_NONE;
  const activePreviewSupportsDistanceLine =
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;
  const activePreviewUsesPolylineDistanceRules =
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR;
  const activePreviewForceDirectDistanceLine =
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR ||
    activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL;

  const handlePointQueryPointerMove = useCallback(
    (
      positionECEF: Cartesian3 | null,
      _screenPosition?: Cartesian2,
      surfaceNormalECEF?: Cartesian3 | null
    ) => {
      if (hasActivePreviewNode) {
        const hasVerticalOffsetStem =
          activePreview.type === ANNOTATION_LIVE_PREVIEW_TYPE_POINT &&
          Math.abs(activePreview.verticalOffsetMeters) > 1e-9;
        const previewPosition = positionECEF
          ? Math.abs(activePreview.verticalOffsetMeters) > 1e-9
            ? getPositionWithVerticalOffsetFromAnchor(
                positionECEF,
                activePreview.verticalOffsetMeters
              )
            : positionECEF
          : null;
        setLivePreviewPointECEF((prev) => {
          if (!previewPosition) {
            return prev ? null : prev;
          }
          if (
            prev &&
            prev.x === previewPosition.x &&
            prev.y === previewPosition.y &&
            prev.z === previewPosition.z
          ) {
            return prev;
          }
          return Cartesian3.clone(previewPosition);
        });
        setLivePreviewSurfaceNormalECEF((prev) => {
          if (!previewPosition || !surfaceNormalECEF) {
            return prev ? null : prev;
          }

          const normalized = Cartesian3.normalize(
            surfaceNormalECEF,
            new Cartesian3()
          );
          if (prev && 1 - Math.abs(Cartesian3.dot(prev, normalized)) <= 1e-5) {
            return prev;
          }

          return normalized;
        });
        setLivePreviewVerticalOffsetAnchorECEF((prev) => {
          if (!hasVerticalOffsetStem || !positionECEF || !previewPosition) {
            return prev ? null : prev;
          }
          if (
            prev &&
            prev.x === positionECEF.x &&
            prev.y === positionECEF.y &&
            prev.z === positionECEF.z
          ) {
            return prev;
          }
          return Cartesian3.clone(positionECEF);
        });
        scene?.requestRender();
      } else {
        setLivePreviewPointECEF((prev) => (prev ? null : prev));
        setLivePreviewSurfaceNormalECEF((prev) => (prev ? null : prev));
        setLivePreviewVerticalOffsetAnchorECEF((prev) => (prev ? null : prev));
      }

      if (!isVerticalPolygon) return;
      const verticalPolygonContext = activePreview.verticalPolygonContext;
      if (!verticalPolygonContext) return;
      const firstPoint = measurements.find(
        (measurement) =>
          measurement.id === verticalPolygonContext.firstVertexPointId &&
          isPointAnnotationEntry(measurement)
      );
      if (!firstPoint || !isPointAnnotationEntry(firstPoint)) return;

      const previewAreaSquareMeters = positionECEF
        ? getFacadeRectanglePreviewAreaSquareMeters(
            firstPoint.geometryECEF,
            positionECEF
          )
        : 0;

      setPlanarPolygonGroups((prev) =>
        prev.map((group) => {
          if (group.id !== verticalPolygonContext.groupId || group.closed) {
            return group;
          }
          if ((group.surfaceType ?? "roof") !== "facade") {
            return group;
          }
          if (group.vertexPointIds.length !== 1) {
            return group;
          }
          if (
            Math.abs((group.areaSquareMeters ?? 0) - previewAreaSquareMeters) <=
            1e-9
          ) {
            return group;
          }
          return {
            ...group,
            areaSquareMeters: previewAreaSquareMeters,
          };
        })
      );

      scene?.requestRender();
    },
    [
      activePreview,
      getFacadeRectanglePreviewAreaSquareMeters,
      getPositionWithVerticalOffsetFromAnchor,
      hasActivePreviewNode,
      isVerticalPolygon,
      measurements,
      scene,
      setPlanarPolygonGroups,
    ]
  );

  const isLivePointPreviewModeActive =
    hasActivePreviewNode &&
    pointQueryEnabled &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;

  useEffect(() => {
    if (isLivePointPreviewModeActive) return;
    setLivePreviewPointECEF((prev) => (prev ? null : prev));
    setLivePreviewSurfaceNormalECEF((prev) => (prev ? null : prev));
    setLivePreviewVerticalOffsetAnchorECEF((prev) => (prev ? null : prev));
  }, [isLivePointPreviewModeActive]);

  return {
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
    livePreviewVerticalOffsetAnchorECEF,
    handlePointQueryPointerMove,
    previewIsPolylineCreateMode,
    hasActivePreviewNode,
    activePreviewSupportsDistanceLine,
    activePreviewUsesPolylineDistanceRules,
    activePreviewForceDirectDistanceLine,
    isLivePointPreviewModeActive,
  };
};
