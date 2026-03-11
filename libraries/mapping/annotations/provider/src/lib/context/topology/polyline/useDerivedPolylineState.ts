import { useMemo } from "react";
import { Cartesian3, type Scene } from "@carma/cesium";
import {
  buildDerivedPolylinePaths,
  type AnnotationCollection,
  type DerivedPolylinePath,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

export const useDerivedPolylineState = (
  scene: Scene,
  annotations: AnnotationCollection,
  nodeChainAnnotations: NodeChainAnnotation[],
  defaultVerticalOffsetMeters: number,
  useOffsetAnchors: boolean,
  referencePoint: Cartesian3 | null
): { polylines: DerivedPolylinePath[]; referenceElevation: number } => {
  const referenceElevation = useMemo(() => {
    if (!referencePoint || !scene) return 0;
    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(referencePoint);
    return cartographic?.height ?? 0;
  }, [referencePoint, scene]);

  const polylines = useMemo(
    () =>
      buildDerivedPolylinePaths({
        annotations,
        nodeChainAnnotations,
        defaultVerticalOffsetMeters,
        useOffsetAnchors,
      }),
    [
      defaultVerticalOffsetMeters,
      annotations,
      nodeChainAnnotations,
      useOffsetAnchors,
    ]
  );

  return {
    polylines,
    referenceElevation,
  };
};
