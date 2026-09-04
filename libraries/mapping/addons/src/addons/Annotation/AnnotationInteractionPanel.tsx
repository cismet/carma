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
    groups,
    activeId,
    pickGroup,
    zoomToGroup,
    deleteGroup,
  } = useAnnotationActions();

  // the drawing held ready for the next stroke is not one yet, so it has no pill
  const drawings = useMemo<AnnotationDrawingEntry[]>(
    () =>
      groups
        .filter((group) => group.coverage)
        .map((group, index) => ({
          id: group.id,
          // only the first one is spelled out, the rest read as a numbered list
          label: index === 0 ? `Zeichnung 1` : `${index + 1}`,
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
      onUndo={isLocked ? undefined : undo}
      onRedo={isLocked ? undefined : redo}
    />
  );
};
