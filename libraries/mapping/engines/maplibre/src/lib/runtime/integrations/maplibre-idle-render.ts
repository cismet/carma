import type { Map as MaplibreMap } from "maplibre-gl";

type IdleRenderHost = {
  painter?: {
    context?: { setDirty?: () => void };
    setBaseState?: () => void;
  };
};

/**
 * MapLibre 5's draw_custom.ts invalidates its cached GL bindings after external
 * rendering. Idle work is outside that callback, so the same boundary must be
 * explicit: resetting Three alone leaves MapLibre's program/VAO/textures stale.
 *
 * PRIVATE API, deliberately isolated and feature-tested. MapLibre has no public
 * out-of-frame shared-context boundary. On incompatible versions skip optional
 * idle GPU work; never guess that restoring only the framebuffer is sufficient.
 * The callback must be synchronous, restore its FBO/depth state, and not request
 * a repaint. Revisit when MapLibre exposes an equivalent public API.
 */
export const runMapLibreIdleRender = (
  map: MaplibreMap | null,
  render: () => void
): boolean => {
  const painter = (map as IdleRenderHost | null)?.painter;
  const context = painter?.context;
  if (
    typeof context?.setDirty !== "function" ||
    typeof painter?.setBaseState !== "function"
  )
    return false;
  try {
    render();
    return true;
  } finally {
    context.setDirty();
    painter.setBaseState();
  }
};
