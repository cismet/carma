import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma/units/helpers";
import { readInitialCameraViewFromSceneViewState } from "./readInitialCameraViewFromSceneViewState";

describe("readInitialCameraViewFromSceneViewState", () => {
  it("preserves canonical zoom and longer-edge fov for later viewport-aware restore", () => {
    const initialView = readInitialCameraViewFromSceneViewState({
      longitude: degToRadNumeric(7.2018253)!,
      latitude: degToRadNumeric(51.2720217)!,
      altitude: 165.14,
      zoom: 15.001,
      bearing: degToRadNumeric(180)!,
      pitch: degToRadNumeric(0)!,
      range: 750,
      fovVertical: degToRadNumeric(45)!,
      fovLongerEdge: degToRadNumeric(72)!,
    });

    expect(initialView).toBeDefined();
    expect(initialView?.anchor?.longitude).toBeCloseTo(
      degToRadNumeric(7.2018253)!,
      8
    );
    expect(initialView?.zoom).toBeCloseTo(15.001, 8);
    expect(initialView?.fov).toBeCloseTo(degToRadNumeric(45)!, 8);
    expect(initialView?.fovLongerEdge).toBeCloseTo(degToRadNumeric(72)!, 8);
  });
});
