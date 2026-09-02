import { useAnnotationActions } from "./annotation-actions";
import { AnnotationShapeToolbar } from "./AnnotationShapeToolbar";
import { DEFAULT_SHAPES } from "./shape-tools";

export const AnnotationInteractionPanel = () => {
  const { isOn, isLocked, shape, setShape, undo, redo, toggleLock, addGroup } =
    useAnnotationActions();

  if (!isOn) {
    return null;
  }

  // locked: only the lock and the new-drawing button stay reachable
  return (
    <AnnotationShapeToolbar
      shapes={isLocked ? [] : DEFAULT_SHAPES}
      shape={shape}
      onShapeChange={setShape}
      isLocked={isLocked}
      onToggleLock={toggleLock}
      onAddGroup={addGroup}
      onUndo={isLocked ? undefined : undo}
      onRedo={isLocked ? undefined : redo}
    />
  );
};
