export const THREE_TILES_LAYER_TYPE = "three-tiles" as const;

export const THREE_TILES_SHADER_KIND = {
  CLAY: "clay",
} as const;

export type ThreeTilesClayShader = {
  kind: typeof THREE_TILES_SHADER_KIND.CLAY;
  color: string;
  roughness?: number;
  metalness?: number;
};

/** Serializable 3D Tiles layer contract used by catalog/drop integrations. */
export type ThreeTilesLayer = {
  type: typeof THREE_TILES_LAYER_TYPE;
  name: string;
  url: string;
  carmaLayerId?: string;
  origin?: [longitude: number, latitude: number];
  shader: ThreeTilesClayShader;
  opacity?: number;
  errorTarget?: number;
  requestConcurrency?: number;
};
