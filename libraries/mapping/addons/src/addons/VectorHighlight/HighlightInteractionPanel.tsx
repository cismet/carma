import { useHighlightModeActions } from "./highlight-actions";
import { OPERATION_COLORS } from "./operations";
import { ShapeToolbar } from "./ShapeToolbar";

/**
 * Panel content for the highlight row, rendered by the host's interaction view
 * so it gets the same backdrop the measurement tools have.
 */
export const HighlightInteractionPanel = () => {
  const { shapes, shape, setShape, clear, canClear, operation } =
    useHighlightModeActions();

  if (shapes.length < 2) {
    return null;
  }

  return (
    <ShapeToolbar
      shapes={shapes}
      shape={shape}
      onShapeChange={setShape}
      onClear={clear}
      canClear={canClear}
      activeColor={OPERATION_COLORS[operation]}
    />
  );
};
