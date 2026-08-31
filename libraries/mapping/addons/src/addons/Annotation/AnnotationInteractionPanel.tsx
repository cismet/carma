import { useAnnotationActions } from "./annotation-actions";
import { AnnotationShapeToolbar } from "./AnnotationShapeToolbar";
import { DEFAULT_SHAPES } from "./shape-tools";

export const AnnotationInteractionPanel = () => {
  const { isOn, shape, setShape, undo, redo } = useAnnotationActions();

  if (!isOn) {
    return null;
  }

  return (
    <AnnotationShapeToolbar
      shapes={DEFAULT_SHAPES}
      shape={shape}
      onShapeChange={setShape}
      onUndo={undo}
      onRedo={redo}
    />
  );
};
