import { Matrix4, Vector3 } from "@carma/math";
import { describe, expect, it } from "vitest";
import {
  enuDirectionToLocalYUpSceneDirection,
  localYUpSceneDirectionToEnuDirection,
  readEnuToLocalYUpSceneRotationMatrix,
  readLocalYUpSceneToEnuRotationMatrix,
} from "./local-y-up-scene";

const expectVectorCloseTo = (actual: Vector3, expected: Vector3): void => {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
  expect(actual.z).toBeCloseTo(expected.z, 8);
};

describe("local Y-up scene conversions", () => {
  it("maps ENU axes into the canonical local Y-up scene basis", () => {
    expectVectorCloseTo(
      enuDirectionToLocalYUpSceneDirection(new Vector3(1, 0, 0)),
      new Vector3(1, 0, 0)
    );
    expectVectorCloseTo(
      enuDirectionToLocalYUpSceneDirection(new Vector3(0, 1, 0)),
      new Vector3(0, 0, -1)
    );
    expectVectorCloseTo(
      enuDirectionToLocalYUpSceneDirection(new Vector3(0, 0, 1)),
      new Vector3(0, 1, 0)
    );
  });

  it("maps local Y-up scene axes back into ENU", () => {
    expectVectorCloseTo(
      localYUpSceneDirectionToEnuDirection(new Vector3(1, 0, 0)),
      new Vector3(1, 0, 0)
    );
    expectVectorCloseTo(
      localYUpSceneDirectionToEnuDirection(new Vector3(0, 1, 0)),
      new Vector3(0, 0, 1)
    );
    expectVectorCloseTo(
      localYUpSceneDirectionToEnuDirection(new Vector3(0, 0, -1)),
      new Vector3(0, 1, 0)
    );
  });

  it("exposes inverse rotation matrices", () => {
    const enuToLocalYUpScene = readEnuToLocalYUpSceneRotationMatrix();
    const localYUpSceneToEnu = readLocalYUpSceneToEnuRotationMatrix();
    const composed = new Matrix4().multiplyMatrices(
      localYUpSceneToEnu,
      enuToLocalYUpScene
    );

    expectVectorCloseTo(
      new Vector3(0.2, 0.3, 0.4).transformDirection(composed),
      new Vector3(0.2, 0.3, 0.4).normalize()
    );
  });
});
