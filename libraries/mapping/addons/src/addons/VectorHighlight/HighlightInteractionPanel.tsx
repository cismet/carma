import { useHighlightModeActions } from "./highlight-actions";
import { OPERATIONS } from "./operations";
import { OperationToolbar } from "./OperationToolbar";
import { ShapeToolbar } from "./ShapeToolbar";

/**
 * Panel content for the highlight row, rendered by the host's interaction view
 * so it gets the same backdrop the measurement tools have. Operations first,
 * then the shapes, each section switched from the row.
 */
export const HighlightInteractionPanel = () => {
  const {
    shapes,
    shape,
    setShape,
    clear,
    canClear,
    operation,
    setOperation,
    colorForOperation,
    showOperations,
    showShapes,
  } = useHighlightModeActions();

  const activeColor = colorForOperation(operation);
  const hasShapes = showShapes && shapes.length > 1;

  if (!showOperations && !hasShapes) {
    return null;
  }

  return (
    <div className="w-fit max-w-full flex items-center gap-2 overflow-visible">
      {showOperations && (
        <OperationToolbar
          operations={OPERATIONS}
          operation={operation}
          onOperationChange={setOperation}
          activeColor={activeColor}
        />
      )}
      {showOperations && hasShapes && (
        <span className="h-6 w-px bg-gray-300/80" aria-hidden />
      )}
      {hasShapes && (
        <ShapeToolbar
          shapes={shapes}
          shape={shape}
          onShapeChange={setShape}
          onClear={clear}
          canClear={canClear}
          activeColor={activeColor}
        />
      )}
    </div>
  );
};
