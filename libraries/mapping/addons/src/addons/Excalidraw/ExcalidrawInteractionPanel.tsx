import { useExcalidrawActions } from "./excalidraw-actions";
import { ExcalidrawShapeToolbar } from "./ExcalidrawShapeToolbar";
import { DEFAULT_SHAPES } from "./shape-tools";

export const ExcalidrawInteractionPanel = () => {
  const { isOn, shape, setShape, undo, redo } = useExcalidrawActions();

  if (!isOn) {
    return null;
  }

  return (
    <ExcalidrawShapeToolbar
      shapes={DEFAULT_SHAPES}
      shape={shape}
      onShapeChange={setShape}
      onUndo={undo}
      onRedo={redo}
    />
  );
};
