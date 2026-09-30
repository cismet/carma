/** The pipeline a tile waits in: the camera's receivers or the sun's casters. */
export const MESH_TILE_WAIT_ROLE = {
  RECEIVER: "receiver",
  SHADOW: "shadow",
} as const;

export type MeshTileWaitRole =
  (typeof MESH_TILE_WAIT_ROLE)[keyof typeof MESH_TILE_WAIT_ROLE];

/** What a tile waits for before it can be presented in its role. */
export const MESH_TILE_WAIT_REASON = {
  MATERIAL: "material",
  REPLACEMENT_FAMILY: "replacement-family",
  SHADOW_FAMILY: "shadow-family",
  RENDER: "render",
  SHADOW_RENDER: "shadow-render",
  SHADOW_ACCUMULATION: "shadow-accumulation",
} as const;

export type MeshTileWaitReason =
  (typeof MESH_TILE_WAIT_REASON)[keyof typeof MESH_TILE_WAIT_REASON];
