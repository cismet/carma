import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  buildOrientationQuaternionFromWorldCameraBasisAtAnchor,
  localYUpSceneDirectionToWorldDirectionAtAnchor,
  worldDirectionToLocalYUpSceneDirectionAtAnchor,
} from "./geospatial-camera-basis";
import { readLocalCameraBasis } from "./local-camera-basis";

describe("geospatial camera basis", () => {
  const anchor = new Vector3(6378137, 0, 0);

  it("roundtrips local and world directions at an anchor", () => {
    const localDirection = new Vector3(0.3, 0.5, -0.8).normalize();
    const worldDirection = localYUpSceneDirectionToWorldDirectionAtAnchor(
      localDirection,
      anchor
    );
    const roundtripped = worldDirectionToLocalYUpSceneDirectionAtAnchor(
      worldDirection,
      anchor
    );

    expect(roundtripped.distanceTo(localDirection)).toBeLessThan(1e-8);
  });

  it("rebuilds the local orientation from a world camera basis at an anchor", () => {
    const orientation = new Quaternion().setFromAxisAngle(
      new Vector3(0.4, 0.7, -0.2).normalize(),
      0.9
    );
    const localBasis = readLocalCameraBasis(orientation);
    const worldBasis = {
      forward: localYUpSceneDirectionToWorldDirectionAtAnchor(
        localBasis.forward,
        anchor
      ),
      right: localYUpSceneDirectionToWorldDirectionAtAnchor(
        localBasis.right,
        anchor
      ),
      up: localYUpSceneDirectionToWorldDirectionAtAnchor(localBasis.up, anchor),
    };

    const rebuilt = buildOrientationQuaternionFromWorldCameraBasisAtAnchor(
      worldBasis,
      anchor
    );

    expect(rebuilt.angleTo(orientation)).toBeLessThan(1e-8);
  });
});
