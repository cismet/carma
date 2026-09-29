import { type Map as MapLibreMap } from "maplibre-gl";
import {
  type MeshProjectionAccuracy,
  type MeshReprojectionMode,
} from "@carma-geo/proj";
import { type MeshMountAnchor, type MeshMountView } from "./mesh-mount-presets";

export type MeshMountDemoOptions = {
  maplibreTerrain?: boolean;
  projectBasemap?: boolean;
  projectionAccuracy?: MeshProjectionAccuracy | "custom";
  /** Enables the existing native probe registry solely for repeatable benchmarks. */
  projectionBenchmarkProbe?: boolean;
  reprojectionMode?: MeshReprojectionMode;
  projectionGridStepMeters?: number;
  onMapReady?: (map: MapLibreMap) => () => void;
  dataset?: "mesh2024" | "lod2";
  view: MeshMountView;
  anchor: MeshMountAnchor;
  zoom: number;
  pitch: number;
  verticalFovDegrees: number;
  basemapOpacity: number;
  pixelError: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportPosition: "top-left" | "center" | "bottom-right";
  animateViewport: boolean;
  /** Embedded comparison cells retain independent maps, with compact diagnostics. */
  compact?: boolean;
};

export type MeshMountSharedViewsOptions = MeshMountDemoOptions & {
  animateOverlap?: boolean;
  meshOnlyFlight?: boolean;
};
