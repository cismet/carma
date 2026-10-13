import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";

export type ResizablePanelProps = ComponentPropsWithoutRef<"div"> & {
  resize?: CSSProperties["resize"];
};

/** Native resize surface shared by map diagnostic panels; caller owns sizing and position. */
export const ResizablePanel = forwardRef<HTMLDivElement, ResizablePanelProps>(
  ({ resize = "both", style, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      style={{ overflow: "auto", boxSizing: "border-box", ...style, resize }}
    />
  )
);
ResizablePanel.displayName = "ResizablePanel";
