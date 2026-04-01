import type { FeatureInfoProperties } from "@carma-mapping/utils";

export interface ModelOptions {
  uri: string;
  scale?: number;
  show?: boolean;
  [key: string]: unknown;
}

export interface ModelConfig {
  position: {
    longitude: number; // degrees
    latitude: number; // degrees
    altitude: number; // meters
  };
  orientation?: {
    heading?: number; // degrees
    pitch?: number; // degrees
    roll?: number; // degrees
  };
  model: ModelOptions;
  name?: string;
  properties: FeatureInfoProperties;
}
