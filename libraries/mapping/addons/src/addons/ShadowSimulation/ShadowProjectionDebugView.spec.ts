import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, OrthographicCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { ecefToEnuOffset } from "@carma-geo/utils";

import type {
  TiledShadowSnapshot,
  TiledShadowTileSnapshot,
} from "./tiled-shadow-controller";
import {
  buildShadowProjectionDebugModel,
  buildShadowTileCoreInsetsPercent,
} from "./shadow-projection-debug-model";
import type { ShadowTileLayoutStatistics } from "./shadow-tile-layout";

const buildMap = () =>
  ({
    getBearing: () => 0,
    getCenter: () => ({ lng: 7.15, lat: 51.25 }),
    getCanvas: () => ({
      clientWidth: 1_000,
      clientHeight: 500,
      width: 1_000,
      height: 500,
    }),
    getPitch: () => 45,
    getZoom: () => 16,
    unproject: ([x, y]: [number, number]) => ({
      lng: 7.15 + (x - 500) * 0.00001,
      lat: 51.25 - (y - 250) * 0.00001,
    }),
  } as unknown as MaplibreMap);

const buildSnapshot = () => {
  const camera = new OrthographicCamera(-80, 120, 60, -40, 1, 4_000);
  camera.updateProjectionMatrix();
  return {
    cameraRangeMeters: 2_500,
    leftMeters: camera.left,
    rightMeters: camera.right,
    bottomMeters: camera.bottom,
    topMeters: camera.top,
    nearMeters: camera.near,
    farMeters: camera.far,
    projectionMatrixElements: [...camera.projectionMatrix.elements],
    shadowMapWidth: 4_096,
    shadowMapHeight: 4_096,
    minimumElevationMeters: 120,
    maximumElevationMeters: 320,
    sceneAnchorPositionElements: [10, 20, 30],
  } as const;
};

type TileFixture = Readonly<{
  row: number;
  column: number;
  receiverLeftMeters: number;
  receiverRightMeters: number;
  receiverBottomMeters: number;
  receiverTopMeters: number;
  leftMeters: number;
  rightMeters: number;
  bottomMeters: number;
  topMeters: number;
  guardMeters: number;
  texelMeters: number;
}>;

const TILE_OUTER_SIZE_METERS = 106;
const TILE_TEXEL_METERS = TILE_OUTER_SIZE_METERS / 1_024;

const TILE_FIXTURES: readonly TileFixture[] = [
  {
    row: 0,
    column: 0,
    receiverLeftMeters: -100,
    receiverRightMeters: 0,
    receiverBottomMeters: 0,
    receiverTopMeters: 100,
    leftMeters: -103,
    rightMeters: 3,
    bottomMeters: -3,
    topMeters: 103,
    guardMeters: 3,
    texelMeters: TILE_TEXEL_METERS,
  },
  {
    row: 0,
    column: 1,
    receiverLeftMeters: 0,
    receiverRightMeters: 70,
    receiverBottomMeters: 0,
    receiverTopMeters: 100,
    leftMeters: -3,
    rightMeters: 103,
    bottomMeters: -3,
    topMeters: 103,
    guardMeters: 3,
    texelMeters: TILE_TEXEL_METERS,
  },
  {
    row: 1,
    column: 0,
    receiverLeftMeters: -100,
    receiverRightMeters: 0,
    receiverBottomMeters: -70,
    receiverTopMeters: 0,
    leftMeters: -103,
    rightMeters: 3,
    bottomMeters: -103,
    topMeters: 3,
    guardMeters: 3,
    texelMeters: TILE_TEXEL_METERS,
  },
  {
    row: 1,
    column: 1,
    receiverLeftMeters: 0,
    receiverRightMeters: 70,
    receiverBottomMeters: -70,
    receiverTopMeters: 0,
    leftMeters: -3,
    rightMeters: 103,
    bottomMeters: -103,
    topMeters: 3,
    guardMeters: 3,
    texelMeters: TILE_TEXEL_METERS,
  },
];

const buildTile = ({
  row,
  column,
  receiverLeftMeters,
  receiverRightMeters,
  receiverBottomMeters,
  receiverTopMeters,
  leftMeters,
  rightMeters,
  bottomMeters,
  topMeters,
  guardMeters,
  texelMeters,
}: TileFixture): TiledShadowTileSnapshot => {
  const index = row * 2 + column;
  const camera = new OrthographicCamera(
    leftMeters,
    rightMeters,
    topMeters,
    bottomMeters,
    1,
    4_000
  );
  camera.position.set(80 + index * 45, 240 + index * 25, -110 + index * 30);
  camera.lookAt(new Vector3(index * 20 - 15, 40 + index * 5, index * -10));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return {
    id: `r${row}-c${column}`,
    row,
    column,
    receiverPointCount: 8,
    receiverLeftMeters,
    receiverRightMeters,
    receiverBottomMeters,
    receiverTopMeters,
    leftMeters,
    rightMeters,
    bottomMeters,
    topMeters,
    nearMeters: camera.near,
    farMeters: camera.far,
    shadowMapWidth: 1_024,
    shadowMapHeight: 1_024,
    viewMatrixElements: [...camera.matrixWorldInverse.elements],
    projectionMatrixElements: [...camera.projectionMatrix.elements],
    statistics: {
      casterGuardMeters: guardMeters,
      effectiveMetersPerTexel: texelMeters,
    } as ShadowTileLayoutStatistics,
  };
};

const buildTiledSnapshot = (): TiledShadowSnapshot => {
  const tiles = TILE_FIXTURES.map(buildTile);
  return {
    strategy: "tiled-light-space",
    tileCount: tiles.length,
    totalShadowTexels: tiles.reduce(
      (total, tile) => total + tile.shadowMapWidth * tile.shadowMapHeight,
      0
    ),
    casterReachMeters: 875,
    tiles,
  };
};

describe("buildShadowProjectionDebugModel", () => {
  const instant = new Date("2026-06-21T10:00:00.000Z");

  it("represents the map camera and directional sun as separate frusta", () => {
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 120, elevationDegrees: 30 },
      buildSnapshot()
    );

    expect(model).not.toBeNull();
    expect(model?.viewStates).toHaveLength(2);
    expect(model?.viewStates[1].intrinsics.type).toBe(CAMERA_TYPE.ORTHOGRAPHIC);
    expect(model?.viewportWidthMeters).toBeGreaterThan(0);
    expect(model?.viewportHeightMeters).toBeGreaterThan(0);
    expect(model?.receiverCoverageWidthMeters).toBe(200);
    expect(model?.receiverCoverageHeightMeters).toBe(100);
    expect(model?.shadowTexelWidthMeters).toBeCloseTo(200 / 4_096, 8);
    expect(model?.shadowTexelHeightMeters).toBeCloseTo(100 / 4_096, 8);
    expect(model?.elevationSpanMeters).toBe(200);
    expect(model?.horizontalProjectionPerHeight).toBeCloseTo(Math.sqrt(3), 5);
  });

  it("shows the rapidly growing caster reach near the horizon", () => {
    const map = buildMap();
    const highSun = buildShadowProjectionDebugModel(
      map,
      { instant, azimuthDegrees: 180, elevationDegrees: 60 },
      buildSnapshot()
    );
    const lowSun = buildShadowProjectionDebugModel(
      map,
      { instant, azimuthDegrees: 180, elevationDegrees: 5 },
      buildSnapshot()
    );

    expect(lowSun?.horizontalProjectionPerHeight).toBeGreaterThan(
      highSun?.horizontalProjectionPerHeight ?? Number.POSITIVE_INFINITY
    );
  });

  it("keeps all four light-space tiles in the 2D diagnostics", () => {
    const tiledShadow = buildTiledSnapshot();
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 120, elevationDegrees: 30 },
      { ...buildSnapshot(), tiledShadow }
    );

    expect(model).not.toBeNull();
    expect(model?.viewStates).toHaveLength(5);
    expect(model?.viewStates[1]?.intrinsics.type).toBe(
      CAMERA_TYPE.ORTHOGRAPHIC
    );
    expect(model?.viewStates[1]?.metadata.sourceId).toBe(
      "shadow-simulation-projection-debug-sun-r0-c0"
    );
    expect(model?.shadowTiles).toEqual(
      TILE_FIXTURES.map(
        ({
          row,
          column,
          receiverLeftMeters,
          receiverRightMeters,
          receiverBottomMeters,
          receiverTopMeters,
          leftMeters,
          rightMeters,
          bottomMeters,
          topMeters,
          guardMeters,
          texelMeters,
        }) => ({
          id: `r${row}-c${column}`,
          row,
          column,
          receiverLeftMeters,
          receiverRightMeters,
          receiverBottomMeters,
          receiverTopMeters,
          leftMeters,
          rightMeters,
          bottomMeters,
          topMeters,
          widthMeters: rightMeters - leftMeters,
          heightMeters: topMeters - bottomMeters,
          guardMeters,
          texelMeters,
          shadowMapWidth: 1_024,
          shadowMapHeight: 1_024,
        })
      )
    );
    expect(model?.activeShadowTileCount).toBe(4);
    expect(model?.shadowTilePoolSize).toBe(4);
    expect(model?.shadowTilePoolCapacityTexels).toBe(4 * 1_024 ** 2);
    expect(model?.casterReachMeters).toBe(875);
    expect(model?.receiverCoverageWidthMeters).toBe(170);
    expect(model?.receiverCoverageHeightMeters).toBe(170);
  });

  it("preserves asymmetric receiver-core insets within a full edge tile", () => {
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 120, elevationDegrees: 30 },
      { ...buildSnapshot(), tiledShadow: buildTiledSnapshot() }
    );
    const bottomRightTile = model!.shadowTiles[3]!;
    const insets = buildShadowTileCoreInsetsPercent(bottomRightTile);

    expect(insets.left).toBeCloseTo((3 / TILE_OUTER_SIZE_METERS) * 100, 8);
    expect(insets.right).toBeCloseTo((33 / TILE_OUTER_SIZE_METERS) * 100, 8);
    expect(insets.top).toBeCloseTo((3 / TILE_OUTER_SIZE_METERS) * 100, 8);
    expect(insets.bottom).toBeCloseTo((33 / TILE_OUTER_SIZE_METERS) * 100, 8);
  });

  it("reports active tiles separately from the fixed shadow-map pool", () => {
    const fullPool = buildTiledSnapshot();
    const tiledShadow: TiledShadowSnapshot = {
      ...fullPool,
      tileCount: 2,
      tiles: fullPool.tiles.slice(0, 2),
    };
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 120, elevationDegrees: 30 },
      { ...buildSnapshot(), tiledShadow }
    );

    expect(model?.activeShadowTileCount).toBe(2);
    expect(model?.shadowTilePoolSize).toBe(4);
    expect(model?.shadowTilePoolCapacityTexels).toBe(4 * 1_024 ** 2);
  });

  it("uses every active tile pose and its real shadow-buffer aspect", () => {
    const tiledShadow = buildTiledSnapshot();
    const snapshot = { ...buildSnapshot(), tiledShadow };
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 15, elevationDegrees: 8 },
      snapshot
    );
    const changedSolarModel = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 290, elevationDegrees: 65 },
      snapshot
    );

    const viewState = model!.viewStates[1]!;
    const tile = tiledShadow.tiles[0]!;
    const matrixWorld = new Matrix4()
      .fromArray([...tile.viewMatrixElements])
      .invert();
    const expectedOrientation = new Quaternion()
      .setFromRotationMatrix(matrixWorld)
      .normalize();
    expect(viewState.orientation.angleTo(expectedOrientation)).toBeLessThan(
      1e-8
    );
    expect(viewState.intrinsics.projectionMatrix?.elements).toEqual(
      tile.projectionMatrixElements
    );
    expect(model!.viewStates).toHaveLength(1 + tiledShadow.tiles.length);
    for (const [index, tileViewState] of model!.viewStates.slice(1).entries()) {
      const tileSnapshot = tiledShadow.tiles[index]!;
      const projection = tileViewState.intrinsics.projectionMatrix!;
      const frustumAspect =
        Math.abs(2 / projection.elements[0]) /
        Math.abs(2 / projection.elements[5]);
      expect(frustumAspect).toBeCloseTo(
        tileSnapshot.shadowMapWidth / tileSnapshot.shadowMapHeight,
        8
      );
    }

    const offset = ecefToEnuOffset(viewState.cameraPosition, viewState.anchor);
    const scenePosition = new Vector3().setFromMatrixPosition(matrixWorld);
    const expectedRelativePosition = scenePosition.sub(
      new Vector3(...snapshot.sceneAnchorPositionElements)
    );
    expect(offset.east).toBeCloseTo(expectedRelativePosition.x, 6);
    expect(offset.north).toBeCloseTo(-expectedRelativePosition.z, 6);
    expect(offset.up).toBeCloseTo(expectedRelativePosition.y, 6);

    expect(
      changedSolarModel!.viewStates[1]!.orientation.angleTo(
        viewState.orientation
      )
    ).toBeLessThan(1e-8);
  });
});
