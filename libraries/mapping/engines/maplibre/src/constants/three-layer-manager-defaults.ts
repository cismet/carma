export interface ThreeLayerManagerDefaults {
  buildingMinZoom: number;
  loftNumSlices: number;
}

export const THREE_LAYER_MANAGER_DEFAULTS = {
  buildingMinZoom: 14,
  loftNumSlices: 14,
} as const satisfies ThreeLayerManagerDefaults;
