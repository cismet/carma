type MeshSource = Readonly<{
  providesTerrain?: boolean;
  hasRenderableContent?: () => boolean;
}>;

/** One common hard-shadow draw until mesh content first becomes available.
 * Never wait for global request idleness: each corridor certifies its own cut.
 * Completion is latched by runtime identity: dragging/refinement must NEVER
 * switch an existing mesh back from its retained corridor textures to preview.
 */
export function createShadowBootstrapPreview() {
  const completed = new WeakSet<MeshSource>();
  return (sources: readonly MeshSource[]): boolean => {
    let hasMeshSource = false;
    for (const source of sources) {
      if (!source.providesTerrain || !source.hasRenderableContent) continue;
      hasMeshSource = true;
      if (completed.has(source) || source.hasRenderableContent()) {
        completed.add(source);
        return false;
      }
    }
    return hasMeshSource;
  };
}
