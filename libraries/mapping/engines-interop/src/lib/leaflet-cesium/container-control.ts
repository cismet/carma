/**
 * CSS transition helper for direct container control
 * No React dependencies - uses getter function for universal access
 */
export const createContainerVisibilityController = (
  getCesiumContainer: (() => HTMLElement | null | undefined) | undefined,
  duration: number
) => {
  return (visible: boolean, animated = true) => {
    const container = getCesiumContainer?.();
    if (!container) return;

    console.debug(
      `[CSS|2D3D] Setting Cesium container ${visible ? "visible" : "hidden"}`,
      { animated }
    );

    if (animated) {
      container.style.transition = `opacity ${duration}ms ease-in-out`;
    } else {
      container.style.transition = "none";
    }

    container.style.opacity = visible ? "1" : "0.01";
    container.style.pointerEvents = visible ? "auto" : "none";
  };
};
