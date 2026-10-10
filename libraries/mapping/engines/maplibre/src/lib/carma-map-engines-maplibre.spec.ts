import { vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  getCameraRestriction,
  setCameraRestrictionBase,
  setCameraRestrictionOverride,
} from "../utils/cameraRestriction";
import {
  add3dPresence,
  get3dLayerIds,
  remove3dPresence,
} from "../utils/threeDPresence";
import { carmaMapEnginesMaplibre } from "./carma-map-engines-maplibre";

describe("carmaMapEnginesMaplibre", () => {
  it("should work", () => {
    expect(carmaMapEnginesMaplibre()).toEqual("carma-map-engines-maplibre");
  });
});

const cameraMap = () => ({
  dragRotate: { enable: vi.fn(), disable: vi.fn() },
  touchPitch: { enable: vi.fn(), disable: vi.fn() },
  touchZoomRotate: { enableRotation: vi.fn(), disableRotation: vi.fn() },
  keyboard: { enableRotation: vi.fn(), disableRotation: vi.fn() },
  setMaxPitch: vi.fn(),
  setBearing: vi.fn(),
});

describe("camera override ownership and 3D presence", () => {
  it("restores the remaining owner and moves a rewritten owner to latest priority", () => {
    const mock = cameraMap();
    const map = mock as unknown as MaplibreMap;
    const base = {
      restricted: true,
      maxPitch: 60,
      forced: false,
      interactive: true,
    };
    setCameraRestrictionBase(map, base);
    setCameraRestrictionOverride(
      map,
      { restricted: false, maxPitch: 75 },
      "viewer"
    );
    setCameraRestrictionOverride(
      map,
      { restricted: false, maxPitch: 80 },
      "other"
    );
    setCameraRestrictionOverride(
      map,
      { restricted: false, maxPitch: 85 },
      "viewer"
    );
    expect(getCameraRestriction(map)).toEqual({
      restricted: false,
      maxPitch: 85,
    });
    setCameraRestrictionOverride(map, null, "viewer");
    expect(getCameraRestriction(map)).toEqual({
      restricted: false,
      maxPitch: 80,
    });
    expect(mock.setMaxPitch).toHaveBeenLastCalledWith(80);
    setCameraRestrictionOverride(map, null, "other");
    expect(getCameraRestriction(map)).toEqual({
      restricted: true,
      maxPitch: 60,
    });
    expect(mock.setMaxPitch).toHaveBeenLastCalledWith(0);
    expect(mock.dragRotate.disable).toHaveBeenCalled();
  });

  it("keeps a forced base in control and applies the stored owner once force is released", () => {
    const mock = cameraMap();
    const map = mock as unknown as MaplibreMap;
    const base = {
      restricted: true,
      maxPitch: 60,
      forced: true,
      interactive: true,
    };
    setCameraRestrictionBase(map, base);
    setCameraRestrictionOverride(
      map,
      { restricted: false, maxPitch: 85 },
      "viewer"
    );
    expect(getCameraRestriction(map)).toEqual({
      restricted: true,
      maxPitch: 60,
    });
    expect(mock.setMaxPitch).toHaveBeenLastCalledWith(0);
    setCameraRestrictionBase(map, { ...base, forced: false });
    expect(getCameraRestriction(map)).toEqual({
      restricted: false,
      maxPitch: 85,
    });
    expect(mock.dragRotate.enable).toHaveBeenCalled();
    expect(mock.setMaxPitch).toHaveBeenLastCalledWith(85);
  });

  it("isolates presence by map and returns a detached unique list", () => {
    const map = {} as MaplibreMap;
    const other = {} as MaplibreMap;
    add3dPresence(map, "tiles");
    add3dPresence(map, "trees");
    add3dPresence(map, "tiles");
    const ids = get3dLayerIds(map);
    expect(ids).toEqual(["tiles", "trees"]);
    ids.push("external");
    remove3dPresence(map, "tiles");
    expect(get3dLayerIds(map)).toEqual(["trees"]);
    expect(get3dLayerIds(other)).toEqual([]);
  });
});
