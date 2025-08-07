// Mesh configuration types and defaults
// This file defines the structure for external mesh configuration

// Type for mesh configuration items
export type MeshConfigItem = {
  id: string;
  name: string;
  displayName: string;
  displayNameShort: string;
  // Add other properties as needed based on the actual tileset configuration structure
};

// Type for external mesh configuration
export type ExternalMeshConfig = {
  primaryMeshes: string[]; // Array of mesh IDs that correspond to existing tileset configurations
  defaultMeshIndex?: number;
};

// Default mesh configuration that matches the current hardcoded implementation
export const DEFAULT_MESH_CONFIG: ExternalMeshConfig = {
  primaryMeshes: ["WUPP_MESH_2024", "WUPP_MESH_2020"],
  defaultMeshIndex: 0
};

// Mesh configuration that can be loaded from external JSON
export let currentMeshConfig: ExternalMeshConfig = DEFAULT_MESH_CONFIG;

// Function to update the current mesh configuration
export const updateMeshConfig = (newConfig: ExternalMeshConfig) => {
  currentMeshConfig = newConfig;
};