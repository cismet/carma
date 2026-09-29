import type { Camera } from "three";
import type { TerrainTileBounds, TerrainTileId } from "./raster-dem-tile";
import type { TileCameraSnapshot } from "./tile-camera-demand";
import type { RasterDemTileGrid } from "./raster-dem-tile-grid";

export type TerrainSelectionEntry = Readonly<{
  id: TerrainTileId;
  kind: "source";
  /** Shared demand rank, including coverage prerequisites for this cut. */
  priority?: number;
}>;

export type TerrainSelection = Readonly<{
  entries: readonly TerrainSelectionEntry[];
  viewportStages: readonly (readonly TerrainSelectionEntry[])[];
  loadEntries: readonly TerrainSelectionEntry[];
  signature: string;
  viewportElevationSignature: string;
}>;

export type TerrainSelectionCameraSnapshot = Readonly<{
  projectionMatrix: readonly number[];
  matrixWorldInverse: readonly number[];
  matrixWorld: readonly number[];
  coordinateSystem?: Camera["coordinateSystem"];
  reversedDepth?: boolean;
  position: readonly [number, number, number];
  fov: number;
  isOrthographicCamera?: boolean;
}>;

export type TerrainSelectionInput = Readonly<{
  viewportBounds: TerrainTileBounds;
  viewport: readonly [width: number, height: number];
  /** Padded observer focus in full-viewport NDC; affects order, not coverage. */
  viewportFocusNdc?: readonly [x: number, y: number];
  renderCamera: TerrainSelectionCameraSnapshot;
  lodCameraPosition: readonly [number, number, number];
  rootMatrixWorld: readonly number[];
  origin: readonly [x: number, y: number, z: number];
  meterScale: number;
  boundsPaddingMeters?: readonly [x: number, y: number, z: number];
  cameraViews?: readonly (TileCameraSnapshot & { bounds: TerrainTileBounds })[];
  shadow?: Readonly<{
    camera: TerrainSelectionCameraSnapshot;
    shadowMapSize: readonly [width: number, height: number];
    bounds: TerrainTileBounds;
    casterAngularRadiusRadians?: number;
  }>;
  source: RasterDemTileGrid;
  knownHeightRanges: Readonly<Record<string, readonly [number, number]>>;
  unknownHeightRange: readonly [number, number];
  errorTargetPixels: number;
  shadowLevelOffset: number;
  minimumLevel: number;
  maximumLevel: number;
  maxSelectionTiles: number;
  initialErrorTargetPixels: number;
}>;

export type TerrainSelectionAdapter = Readonly<{
  getTileGridIdsForBounds: (
    bounds: TerrainTileBounds,
    level: number
  ) => TerrainTileId[];
  getTileBounds: (id: TerrainTileId) => TerrainTileBounds;
  getTileGeometricError: (level: number) => number;
  getTileDataAvailable: (id: TerrainTileId) => boolean;
}>;
