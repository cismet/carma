import { useMemo } from "react";

import { useAnnotationActions } from "./annotation-actions";
import {
  AnnotationShapeToolbar,
  type AnnotationDrawingEntry,
} from "./AnnotationShapeToolbar";
import { DEFAULT_SHAPES } from "./shape-tools";

export const AnnotationInteractionPanel = () => {
  const {
    isOn,
    isLocked,
    shape,
    setShape,
    undo,
    redo,
    toggleLock,
    addGroup,
    groups,
    activeId,
    pickGroup,
    zoomToGroup,
    deleteGroup,
  } = useAnnotationActions();

  const drawings = useMemo<AnnotationDrawingEntry[]>(
    () =>
      groups.map((group, index) => ({
        id: group.id,
        label: `${index + 1}`,
        name: `Zeichnung ${index + 1}`,
        // locked means nothing is being edited, so nothing is picked out
        active: !isLocked && group.id === activeId,
      })),
    [activeId, groups, isLocked]
  );

  if (!isOn) {
    return null;
  }

  // locked: only the drawing list, the lock and the new-drawing button stay
  return (
    <AnnotationShapeToolbar
      shapes={isLocked ? [] : DEFAULT_SHAPES}
      shape={shape}
      onShapeChange={setShape}
      drawings={drawings}
      onPickDrawing={pickGroup}
      onZoomDrawing={zoomToGroup}
      onDeleteDrawing={deleteGroup}
      isLocked={isLocked}
      onToggleLock={toggleLock}
      onAddGroup={addGroup}
      onUndo={isLocked ? undefined : undo}
      onRedo={isLocked ? undefined : redo}
    />
  );
};
