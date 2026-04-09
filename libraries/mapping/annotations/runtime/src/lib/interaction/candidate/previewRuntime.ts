import { Cartesian3 } from "@carma-cesium";

type AnnotationPreviewSource = "none" | "raw" | "snapped-node";

export type AnnotationPreviewScreenPosition = {
  x: number;
  y: number;
};

export type PreviewRuntimeSnapshot = {
  source: AnnotationPreviewSource;
  candidateNodePositionECEF: Cartesian3 | null;
  candidateNodeScreenPosition: AnnotationPreviewScreenPosition | null;
  candidateNodeSurfaceNormalECEF: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorScreenPosition: AnnotationPreviewScreenPosition | null;
  candidatePointId: string | null;
};

export type SetPreviewRuntimeSnapshotInput = {
  source: AnnotationPreviewSource;
  candidateNodePositionECEF: Cartesian3 | null;
  candidateNodeScreenPosition?: AnnotationPreviewScreenPosition | null;
  candidateNodeSurfaceNormalECEF: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
  candidateNodeVerticalOffsetAnchorScreenPosition?: AnnotationPreviewScreenPosition | null;
  candidatePointId?: string | null;
};

type PreviewRuntimeListener = (snapshot: PreviewRuntimeSnapshot) => void;

export type PreviewRuntimeController = {
  getSnapshot: () => PreviewRuntimeSnapshot;
  publish: (input: SetPreviewRuntimeSnapshotInput) => boolean;
  clear: () => boolean;
  subscribe: (listener: PreviewRuntimeListener) => () => void;
};

const isSameCartesian3 = (left: Cartesian3 | null, right: Cartesian3 | null) =>
  left === right ||
  (!!left &&
    !!right &&
    left.x === right.x &&
    left.y === right.y &&
    left.z === right.z);

const isSameScreenPosition = (
  left: AnnotationPreviewScreenPosition | null,
  right: AnnotationPreviewScreenPosition | null
) =>
  left === right ||
  (!!left && !!right && left.x === right.x && left.y === right.y);

const copyCartesian3OrNull = (
  value: Cartesian3 | null,
  target: Cartesian3 | null
): Cartesian3 | null => {
  if (!value) {
    return null;
  }

  return Cartesian3.clone(value, target ?? new Cartesian3());
};

const copyScreenPositionOrNull = (
  value: AnnotationPreviewScreenPosition | null | undefined,
  target: AnnotationPreviewScreenPosition | null
): AnnotationPreviewScreenPosition | null => {
  if (!value) {
    return null;
  }

  if (target) {
    target.x = value.x;
    target.y = value.y;
    return target;
  }

  return { x: value.x, y: value.y };
};

const createPreviewRuntimeSnapshot = (): PreviewRuntimeSnapshot => ({
  source: "none",
  candidateNodePositionECEF: null,
  candidateNodeScreenPosition: null,
  candidateNodeSurfaceNormalECEF: null,
  candidateNodeVerticalOffsetAnchorECEF: null,
  candidateNodeVerticalOffsetAnchorScreenPosition: null,
  candidatePointId: null,
});

const hasSameSnapshot = (
  snapshot: PreviewRuntimeSnapshot,
  input: SetPreviewRuntimeSnapshotInput
) =>
  snapshot.source === input.source &&
  snapshot.candidatePointId ===
    (input.source === "snapped-node" ? input.candidatePointId ?? null : null) &&
  isSameCartesian3(
    snapshot.candidateNodePositionECEF,
    input.candidateNodePositionECEF
  ) &&
  isSameScreenPosition(
    snapshot.candidateNodeScreenPosition,
    input.candidateNodeScreenPosition ?? null
  ) &&
  isSameCartesian3(
    snapshot.candidateNodeSurfaceNormalECEF,
    input.candidateNodeSurfaceNormalECEF
  ) &&
  isSameCartesian3(
    snapshot.candidateNodeVerticalOffsetAnchorECEF,
    input.candidateNodeVerticalOffsetAnchorECEF
  ) &&
  isSameScreenPosition(
    snapshot.candidateNodeVerticalOffsetAnchorScreenPosition,
    input.candidateNodeVerticalOffsetAnchorScreenPosition ?? null
  );

export const createPreviewRuntimeController = (): PreviewRuntimeController => {
  const snapshot = createPreviewRuntimeSnapshot();
  let hasSnapshot = false;
  const listeners = new Set<PreviewRuntimeListener>();

  const publishSnapshot = () => {
    listeners.forEach((listener) => {
      listener(snapshot);
    });
  };

  const resetSnapshot = () => {
    snapshot.source = "none";
    snapshot.candidateNodePositionECEF = null;
    snapshot.candidateNodeScreenPosition = null;
    snapshot.candidateNodeSurfaceNormalECEF = null;
    snapshot.candidateNodeVerticalOffsetAnchorECEF = null;
    snapshot.candidateNodeVerticalOffsetAnchorScreenPosition = null;
    snapshot.candidatePointId = null;
  };

  return {
    getSnapshot: () => snapshot,
    publish: (input) => {
      if (hasSameSnapshot(snapshot, input)) {
        return false;
      }

      snapshot.source = input.source;
      snapshot.candidateNodePositionECEF = copyCartesian3OrNull(
        input.candidateNodePositionECEF,
        snapshot.candidateNodePositionECEF
      );
      snapshot.candidateNodeScreenPosition = copyScreenPositionOrNull(
        input.candidateNodeScreenPosition,
        snapshot.candidateNodeScreenPosition
      );
      snapshot.candidateNodeSurfaceNormalECEF = copyCartesian3OrNull(
        input.candidateNodeSurfaceNormalECEF,
        snapshot.candidateNodeSurfaceNormalECEF
      );
      snapshot.candidateNodeVerticalOffsetAnchorECEF = copyCartesian3OrNull(
        input.candidateNodeVerticalOffsetAnchorECEF,
        snapshot.candidateNodeVerticalOffsetAnchorECEF
      );
      snapshot.candidateNodeVerticalOffsetAnchorScreenPosition =
        copyScreenPositionOrNull(
          input.candidateNodeVerticalOffsetAnchorScreenPosition,
          snapshot.candidateNodeVerticalOffsetAnchorScreenPosition
        );
      snapshot.candidatePointId =
        input.source === "snapped-node" ? input.candidatePointId ?? null : null;
      hasSnapshot = true;
      publishSnapshot();
      return true;
    },
    clear: () => {
      if (!hasSnapshot) {
        return false;
      }

      hasSnapshot = false;
      resetSnapshot();
      publishSnapshot();
      return true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
