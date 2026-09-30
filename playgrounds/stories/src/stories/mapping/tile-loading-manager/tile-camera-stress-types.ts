import type maplibregl from "maplibre-gl";
import type {
  SharedThreeSceneLayer,
  SharedThreeSceneRuntime,
  ThreeTilesRuntime,
} from "@carma-mapping/engines/maplibre";
import { TILE_STRESS_PRESETS } from "./tile-stress-presets";

export type TileCameraStressArgs = {
  scenario: "panorama" | "facade" | "orbit" | "streetlights" | "night-traffic";
  source: "mesh" | "terrain";
  preset: keyof typeof TILE_STRESS_PRESETS;
  cameraCount: number;
  mode: "panorama" | "object-cover";
  path: "perimeter" | "wupper-bank" | "schwebebahn" | "urban-street" | "custom";
  visibleSegments?: number;
  pairedSides?: boolean;
  streetView?: "left" | "right" | "both";
  upperStreetSide?: "left" | "right";
  closed: boolean;
  customSpine: number[][];
  side: 1 | -1;
  elevation: number;
  radius: number;
  viewHeight: number;
  panoramaVerticalFovDegrees: number;
  panoramaPitchDegrees: number;
  fitVertical: boolean;
  spineMergeAngleDegrees: number;
  verticalPadding: number;
  cameraOffset: number;
  referenceSurfaceOffset?: number;
  objectReferenceDepth?: number;
  perimeterClearance?: number;
  backStreetMargin?: number;
  clipBeforeSurface: number;
  clipping: boolean;
  showImagePlanes: boolean;
  far: number;
  pixelError: number;
  segmentPixels: number;
  previewUpdatesPerSecond: number;
  animate: boolean;
  lightCount: number;
  lightIntensity: number;
  lightRange: number;
  shadowMapSize: number;
  shadowLightLimit: number;
  shadowUpdatesPerSecond: number;
  lightMinHeight: number;
  lightMaxHeight: number;
  orbitSeconds: number;
  mastHeight: number;
  normalBias: number;
  showLightViews: boolean;
  viewLightIndex: number;
  nightCarCount?: number;
  nightLightStrength?: number;
  nightRailTraffic?: boolean;
};

export type World = {
  map: maplibregl.Map;
  layer: SharedThreeSceneLayer;
  runtime: SharedThreeSceneRuntime;
  mesh: ThreeTilesRuntime | null;
  contentRevision: { current: number };
};
