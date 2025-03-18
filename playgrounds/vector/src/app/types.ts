// Type definitions for vector components

// Define the structure of the vector style object based on the poisStyle.json
export interface VectorStyle {
  version: number;
  sources: Record<string, any>;
  glyphs?: string;
  sprite?: string;
  layers: any[];
  [key: string]: any; // Allow for additional properties
}

// Type for the vectorStyles prop that can accept both string URLs and VectorStyle objects
export type VectorStyleInput = string | VectorStyle;
