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
    lineBuffer,
    setLineBuffer,
    hasLastShape,
    bufferPanelOpen,
    setBufferPanelOpen,
    applyLastShape,
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
            showBuffer={shape === "line"}
            bufferWidth={lineBuffer}
            onBufferWidthChange={setLineBuffer}
            bufferOpen={bufferPanelOpen}
            onBufferOpenChange={setBufferPanelOpen}
            onApplyLastShape={applyLastShape}
            canApplyLastShape={hasLastShape}
            {...toolbarProps}
          />
        </div>
      </div>
    </div>
  );
};
