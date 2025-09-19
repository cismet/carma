import { useRef } from "react";
import type { InitialCameraView } from "../CustomViewer";
import type { Viewer } from "cesium";
import { useInitializeWidget } from "./useInitializeWidget";

/**
 * Compatibility wrapper: we no longer use Cesium Viewer in this branch.
 * Delegates to the widget-based initializer. Viewer options are ignored.
 */
export const useInitializeViewer = (
  containerRef?: React.RefObject<HTMLDivElement>,
  _options?: Viewer.ConstructorOptions,
  initialCameraView?: InitialCameraView | null
) => {
  const fallback = useRef<HTMLDivElement>(null);
  // Always call the hook to satisfy rules of hooks; the effect inside handles null refs
  useInitializeWidget(containerRef ?? fallback, initialCameraView ?? undefined);
};

export default useInitializeViewer;
