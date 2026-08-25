import { useHighlightModeActions } from "./highlight-actions";
import { ShapeToolbar, type ShapeToolbarProps } from "./ShapeToolbar";

export type VectorHighlightShapeToolsProps = Pick<
  ShapeToolbarProps,
  "labels" | "clearLabel" | "classNames" | "tooltipPlacement"
> & {
  /** wraps the toolbar; defaults to geoportal's InteractionView strip */
  containerClassName?: string;
};

/**
 * Wired shape picker for apps that place it outside the control layout — the
 * control slots cannot reach the strip under the layer bar. Draws nothing while
 * the mode is off. Must be mounted inside `AddonProvider` and
 * `MapHighlightProvider`.
 */
export const VectorHighlightShapeTools = ({
  containerClassName = "relative z-[998] pointer-events-none",
  ...toolbarProps
}: VectorHighlightShapeToolsProps = {}) => {
  const {
    isOn,
    shapes,
    shape,
    setShape,
    clear,
    canClear,
    shapeBuffer,
    setShapeBuffer,
    bufferPanelOpen,
    setBufferPanelOpen,
    hasLastShape,
    applyBufferedShape,
  } = useHighlightModeActions();

  if (!isOn || shapes.length < 2) {
    return null;
  }

  return (
    <div className={containerClassName}>
      <div className="pt-3 w-full flex items-center justify-center">
        <div className="relative z-10 pointer-events-auto">
          <ShapeToolbar
            shapes={shapes}
            shape={shape}
            onShapeChange={setShape}
            onClear={clear}
            canClear={canClear}
            showBuffer
            bufferWidth={shapeBuffer}
            onBufferWidthChange={setShapeBuffer}
            bufferOpen={bufferPanelOpen}
            onBufferOpenChange={setBufferPanelOpen}
            canBuffer={hasLastShape}
            onApplyBuffer={applyBufferedShape}
            {...toolbarProps}
          />
        </div>
      </div>
    </div>
  );
};
