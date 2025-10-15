export const TerrainModelTypes = {
  DEM: "dem",
  DSM: "dsm",
} as const;

export type TerrainModelType =
  (typeof TerrainModelTypes)[keyof typeof TerrainModelTypes];

export type TerrainProviderConfig = {
  url: string;
  key: string;
  modelType: TerrainModelType;
};
