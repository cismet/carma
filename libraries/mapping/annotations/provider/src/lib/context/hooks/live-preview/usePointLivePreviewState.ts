import { useCallback, useState } from "react";
import { Cartesian3, type Scene } from "@carma/cesium";
import type { AnnotationLivePreviewType } from "../annotationLivePreview.types";
import { isPointPreviewWithOffsetStem } from "./livePreviewCapabilities";

type UsePointLivePreviewStateParams = {
  scene: Scene | null;
  activePreviewType: AnnotationLivePreviewType;
  verticalOffsetMeters: number;
  hasActivePreviewNode: boolean;
  getPositionWithVerticalOffsetFromAnchor: (
    positionECEF: Cartesian3,
    verticalOffsetMeters: number
  ) => Cartesian3;
};

type UsePointLivePreviewStateResult = {
  livePreviewPointECEF: Cartesian3 | null;
  livePreviewSurfaceNormalECEF: Cartesian3 | null;
  livePreviewVerticalOffsetAnchorECEF: Cartesian3 | null;
  updatePointPreviewFromPointerMove: (
    positionECEF: Cartesian3 | null,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
  clearPointPreview: () => void;
};

export const usePointLivePreviewState = ({
  scene,
  activePreviewType,
  verticalOffsetMeters,
  hasActivePreviewNode,
  getPositionWithVerticalOffsetFromAnchor,
}: UsePointLivePreviewStateParams): UsePointLivePreviewStateResult => {
  const [livePreviewPointECEF, setLivePreviewPointECEF] =
    useState<Cartesian3 | null>(null);
  const [livePreviewSurfaceNormalECEF, setLivePreviewSurfaceNormalECEF] =
    useState<Cartesian3 | null>(null);
  const [
    livePreviewVerticalOffsetAnchorECEF,
    setLivePreviewVerticalOffsetAnchorECEF,
  ] = useState<Cartesian3 | null>(null);

  const clearPointPreview = useCallback(() => {
    setLivePreviewPointECEF((prev) => (prev ? null : prev));
    setLivePreviewSurfaceNormalECEF((prev) => (prev ? null : prev));
    setLivePreviewVerticalOffsetAnchorECEF((prev) => (prev ? null : prev));
  }, []);

  const updatePointPreviewFromPointerMove = useCallback(
    (
      positionECEF: Cartesian3 | null,
      surfaceNormalECEF?: Cartesian3 | null
    ) => {
      if (!hasActivePreviewNode) {
        clearPointPreview();
        return;
      }

      const hasVerticalOffsetStem = isPointPreviewWithOffsetStem(
        activePreviewType,
        verticalOffsetMeters
      );
      const previewPosition = positionECEF
        ? Math.abs(verticalOffsetMeters) > 1e-9
          ? getPositionWithVerticalOffsetFromAnchor(
              positionECEF,
              verticalOffsetMeters
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
    },
    [
      activePreviewType,
      clearPointPreview,
      getPositionWithVerticalOffsetFromAnchor,
      hasActivePreviewNode,
      scene,
      verticalOffsetMeters,
    ]
  );

  return {
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
    livePreviewVerticalOffsetAnchorECEF,
    updatePointPreviewFromPointerMove,
    clearPointPreview,
  };
};
