import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, Vector3 } from "three";

import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";
import { pickTopSurfaceAltitude } from "./shared-three-surface-height";

const METERS_PER_DEGREE = 111_320;

/** Near 0/0: scene x/z in metres east/north, y the altitude in metres. */
const project = (
  [longitude, latitude]: [number, number],
  altitude = 0,
  target = new Vector3()
) =>
  target.set(
    longitude * METERS_PER_DEGREE,
    altitude,
    -latitude * METERS_PER_DEGREE
  );

/** A building `height` metres tall whose footprint is centred `eastMeters` east of 0/0. */
const buildingRuntime = (
  eastMeters: number,
  width: number,
  height: number
): SharedThreeSceneRuntime => {
  const root = new Group();
  const building = new Mesh(new BoxGeometry(width, height, width));
  building.position.set(eastMeters, height / 2, 0);
  root.add(building);
  root.updateMatrixWorld(true);
  return {
    id: `building-${eastMeters}`,
    originLngLat: [0, 0],
    root,
    getActiveTileVolumes: () => [],
    update: () => undefined,
  };
};

describe("pickTopSurfaceAltitude", () => {
  it("returns the roof of a building under the point", () => {
    const runtimes = [buildingRuntime(0, 10, 20)];
    expect(pickTopSurfaceAltitude(runtimes, project, [0, 0])).toBeCloseTo(20);
  });

  it("reaches a roof next to the point through the 3 m ring", () => {
    // footprint from 2 m to 8 m east: only the ring sample at 3 m lands on it
    const runtimes = [buildingRuntime(5, 6, 20)];
    expect(pickTopSurfaceAltitude(runtimes, project, [0, 0])).toBeCloseTo(20);
  });

  it("returns null when nothing is drawn near the point", () => {
    const runtimes = [buildingRuntime(50, 10, 20)];
    expect(pickTopSurfaceAltitude(runtimes, project, [0, 0])).toBeNull();
  });

  it("ignores hidden content", () => {
    const runtime = buildingRuntime(0, 10, 20);
    runtime.root.children[0].visible = false;
    expect(pickTopSurfaceAltitude([runtime], project, [0, 0])).toBeNull();
  });

  it("takes the highest of a building and a terrain answering heights", () => {
    const terrain: SharedThreeSceneRuntime = {
      id: "terrain",
      originLngLat: [0, 0],
      root: new Group(),
      providesTerrain: true,
      getDrawnElevation: () => 5,
      update: () => undefined,
    };
    expect(pickTopSurfaceAltitude([terrain], project, [0, 0])).toBe(5);
    expect(
      pickTopSurfaceAltitude(
        [terrain, buildingRuntime(0, 10, 20)],
        project,
        [0, 0]
      )
    ).toBeCloseTo(20);
  });
});
