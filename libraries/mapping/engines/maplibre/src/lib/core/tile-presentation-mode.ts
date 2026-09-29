/** The plain mesh cut, or the exclusive cut the shadow view refines. */
export const TILE_PRESENTATION_MODE = {
  EXCLUSIVE_MESH: "exclusive-mesh",
  EXCLUSIVE_SHADOW: "exclusive-shadow",
} as const;

export type TilePresentationMode =
  (typeof TILE_PRESENTATION_MODE)[keyof typeof TILE_PRESENTATION_MODE];
