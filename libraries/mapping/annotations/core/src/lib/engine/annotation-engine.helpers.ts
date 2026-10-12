import type {
  AnnotationEngine,
  AnnotationProjectionSnapshot,
} from "./annotation-engine.types";

export const isValidAnnotationEngine = (
  engine: AnnotationEngine | null | undefined
): engine is AnnotationEngine => Boolean(engine) && !engine!.isDestroyed();

export const areAnnotationProjectionSnapshotsEqual = (
  left: AnnotationProjectionSnapshot | null,
  right: AnnotationProjectionSnapshot | null
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight &&
    left.viewKey === right.viewKey
  );
};
