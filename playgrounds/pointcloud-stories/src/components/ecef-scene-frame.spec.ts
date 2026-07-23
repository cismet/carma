import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createEcefToSceneMatrix,
  ecefEllipsoidalHeight,
  ecefToScenePosition,
  sceneToEcefPosition,
} from "./ecef-scene-frame";

const ANCHOR_LONGITUDE_DEGREES = 7.163461245;
const ANCHOR_LATITUDE_DEGREES = 51.241111235;
const ANCHOR_ELLIPSOIDAL_HEIGHT = 207.598234228;
const ANCHOR_ECEF = [
  3_970_046.913639711, 498_961.576246063, 4_950_543.333479255,
] as const;

describe("ECEF scene frame", () => {
  const ecefToScene = createEcefToSceneMatrix(
    THREE.MathUtils.degToRad(ANCHOR_LONGITUDE_DEGREES),
    THREE.MathUtils.degToRad(ANCHOR_LATITUDE_DEGREES),
    ANCHOR_ELLIPSOIDAL_HEIGHT
  );

  it("mounts the exact PROJ-derived anchor at the scene origin", () => {
    const scene = ecefToScenePosition(ANCHOR_ECEF, ecefToScene);
    expect(scene.length()).toBeLessThan(0.001);
  });

  it("roundtrips scene positions through the shared mesh frame", () => {
    const scene = new THREE.Vector3(17.4, -2.3, 41.8);
    const ecef = sceneToEcefPosition(scene, ecefToScene);
    const roundtrip = ecefToScenePosition(
      ecef.toArray() as [number, number, number],
      ecefToScene
    );
    expect(roundtrip.distanceTo(scene)).toBeLessThan(1e-8);
  });

  it("recovers the PROJ-derived ellipsoidal anchor height", () => {
    expect(ecefEllipsoidalHeight(ANCHOR_ECEF)).toBeCloseTo(
      ANCHOR_ELLIPSOIDAL_HEIGHT,
      5
    );
  });
});
