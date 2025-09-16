import type { CesiumContextType } from "../CesiumContext";

/**
 * Lightweight tracer that records the last Carma-layer call before any Cesium API use.
 * Logs the stack trace when a render-error fires so you know which line last touched the primitive.
 */
export function attachCallStackTracer(ctx: CesiumContextType): void {
  // hook render errors
  ctx.withViewer((viewer) => {
    viewer.scene.renderError.addEventListener((err) => {
      console.error("[CESIUM|RENDER-ERROR]", err);
      console.log(
        "[CALL-TRACE] last Carma call before error",
        ctx.callStackRef?.current?.slice(-1)[0]
      );

      // also dump destroyed primitives
      for (let i = 0; i < viewer.scene.primitives.length; i++) {
        const p = viewer.scene.primitives.get(i);
        if (p && typeof p.isDestroyed === "function" && p.isDestroyed()) {
          console.log(`[PRIMITIVE ${i}] DESTROYED`, {
            id: (p as { id?: string | number }).id,
            primitive: p,
          });
        }
      }
    });
  });
}
