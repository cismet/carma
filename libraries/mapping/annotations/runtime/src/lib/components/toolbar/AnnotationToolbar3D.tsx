import type { CSSProperties } from "react";

import { AnnotationModeToolbar } from "./AnnotationModeToolbar";
import type { AnnotationToolManager } from "./annotationToolManager";
import { useToolbarModel } from "./model/useToolbarModel";
export function AnnotationToolbar3D({
  pixelWidth = 350,
  toolManager,
  showPrimaryToolbar = true,
  showSecondaryToolbar = true,
  enableMultiDeleteHotkey = true,
  secondaryToolbarContainerStyle,
  secondaryToolbarCollapsedByDefault = false,
  secondaryToolbarDirection = "down",
}: {
  pixelWidth?: number;
  toolManager?: AnnotationToolManager;
  showPrimaryToolbar?: boolean;
  showSecondaryToolbar?: boolean;
  enableMultiDeleteHotkey?: boolean;
  secondaryToolbarContainerStyle?: CSSProperties;
  secondaryToolbarCollapsedByDefault?: boolean;
  secondaryToolbarDirection?: "down" | "right";
}) {
  const toolbarProps = useToolbarModel({
    pixelWidth,
    toolManager,
    showPrimaryToolbar,
    showSecondaryToolbar,
    enableMultiDeleteHotkey,
    secondaryToolbarContainerStyle,
    secondaryToolbarCollapsedByDefault,
    secondaryToolbarDirection,
  });

  return (
    <div
      className="w-full"
      style={{ backgroundColor: "transparent", pointerEvents: "auto" }}
    >
      <AnnotationModeToolbar {...toolbarProps} />
    </div>
  );
}

export default AnnotationToolbar3D;
