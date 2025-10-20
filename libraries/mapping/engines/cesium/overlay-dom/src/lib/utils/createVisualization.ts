import type { VisualizationRegistration, OverlayRenderTarget } from "../types";

/**
 * Helper to create a visualization registration
 *
 * Provides type-safe builder for visualization registrations.
 *
 * @example
 * ```tsx
 * const labelViz = createVisualization({
 *   id: "measurement-labels",
 *   target: "dom",
 *   extractPositions: (measurements) =>
 *     measurements.map(m => ({ cartesian3: m.position, id: m.id })),
 *   render: (measurements, screenPos) => (
 *     <>
 *       {measurements.map(m => {
 *         const pos = screenPos.get(m.id);
 *         if (!pos?.visible) return null;
 *         return (
 *           <div key={m.id} style={{ left: pos.x, top: pos.y }}>
 *             {m.label}
 *           </div>
 *         );
 *       })}
 *     </>
 *   ),
 * });
 * ```
 */
export function createVisualization<TInput, TOutput>(
  config: VisualizationRegistration<TInput, TOutput>
): VisualizationRegistration<TInput, TOutput> {
  return {
    zIndex: 0,
    ...config,
  };
}
