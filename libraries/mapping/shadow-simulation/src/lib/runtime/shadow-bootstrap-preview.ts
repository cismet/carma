type MeshSource = Readonly<{
  providesTerrain?: boolean;
  hasRenderableContent?: () => boolean;
  getRequestDemand?: () => number;
}>;

/** One common hard-shadow draw while a newly attached mesh loads its sunward
 * union. Per-page full-scene draws otherwise compete with decode/publication.
 * Completion is latched by runtime identity: dragging/refinement must NEVER
 * switch an existing mesh back from its retained corridor textures to preview.
 */
export function createShadowBootstrapPreview() {
  const completed = new WeakSet<MeshSource>();
  return (sources: readonly MeshSource[]): boolean => {
    let pending = false;
    for (const source of sources) {
      if (
        !source.providesTerrain ||
        !source.getRequestDemand ||
        !source.hasRenderableContent
      )
        continue;
      if (completed.has(source)) continue;
      // Request demand includes metadata expansion and the pending sunward
      // traversal. Main-view SSE is not the exit condition: a source-capped
      // tile can stay above SSE with no finer payload to request. Regional
      // readiness remains responsible for certifying each soft-shadow cut.
      if (source.hasRenderableContent() && source.getRequestDemand() === 0)
        completed.add(source);
      else pending = true;
    }
    return pending;
  };
}
