import { describe, expect, it } from "vitest";

import type { Scene } from "@carma-cesium";

import {
  getCesiumScenePickExclusions,
  pickCesiumSceneAtPosition,
  pickCesiumSceneFromRay,
  registerCesiumSceneDragSampleExclusionResolver,
  registerCesiumScenePickExclusionResolver,
} from "./cesium-scene-picking";

describe("Cesium scene picking", () => {
  it("always excludes tool helpers and conditionally includes drag geometry", () => {
    const scene = {} as Scene;
    const queryDisc = {};
    const committedLine = {};
    const previewLine = {};
    const unregisterQuery = registerCesiumScenePickExclusionResolver(
      scene,
      () => [queryDisc]
    );
    const unregisterCommitted = registerCesiumSceneDragSampleExclusionResolver(
      scene,
      () => [committedLine]
    );
    const unregisterPreview = registerCesiumSceneDragSampleExclusionResolver(
      scene,
      () => [previewLine, committedLine]
    );

    expect(getCesiumScenePickExclusions(scene)).toEqual([queryDisc]);
    expect(
      getCesiumScenePickExclusions(scene, {
        includeDragSampleExclusions: true,
      })
    ).toEqual([queryDisc, committedLine, previewLine]);

    unregisterCommitted();
    expect(
      getCesiumScenePickExclusions(scene, {
        includeDragSampleExclusions: true,
      })
    ).toEqual([queryDisc, previewLine, committedLine]);

    unregisterPreview();
    unregisterQuery();
    expect(getCesiumScenePickExclusions(scene)).toEqual([]);
  });

  it("normalizes collection registrations to the children Cesium reports as picked", () => {
    const scene = {} as Scene;
    const firstPolyline = {};
    const secondPolyline = {};
    const polylineCollection = {
      length: 2,
      get: (index: number) => [firstPolyline, secondPolyline][index],
    };
    const unregister = registerCesiumScenePickExclusionResolver(scene, () => [
      polylineCollection,
    ]);

    expect(getCesiumScenePickExclusions(scene)).toEqual([
      polylineCollection,
      firstPolyline,
      secondPolyline,
    ]);

    unregister();
  });

  it("hides registered helpers only for the synchronous ray pick", () => {
    const helper = { show: true };
    const alreadyHiddenHelper = { show: false };
    const ray = {} as Parameters<typeof pickCesiumSceneFromRay>[1];
    let observedShowStates: boolean[] = [];
    let observedExclusions: readonly object[] = [];
    const scene = {
      pickFromRay: (
        _ray: typeof ray,
        exclusions: readonly object[] | undefined
      ) => {
        observedShowStates = [helper.show, alreadyHiddenHelper.show];
        observedExclusions = exclusions ?? [];
        return { position: undefined };
      },
    } as unknown as Scene;
    const unregister = registerCesiumScenePickExclusionResolver(scene, () => [
      helper,
      alreadyHiddenHelper,
    ]);

    pickCesiumSceneFromRay(scene, ray);

    expect(observedShowStates).toEqual([false, false]);
    expect(observedExclusions).toEqual([helper, alreadyHiddenHelper]);
    expect(helper.show).toBe(true);
    expect(alreadyHiddenHelper.show).toBe(false);

    unregister();
  });

  it("hides registered helpers only for the synchronous screen pick", () => {
    const helper = { show: true };
    const alreadyHiddenHelper = { show: false };
    const position = {} as Parameters<typeof pickCesiumSceneAtPosition>[1];
    const underlyingObject = {};
    let observedShowStates: boolean[] = [];
    const scene = {
      pick: () => {
        observedShowStates = [helper.show, alreadyHiddenHelper.show];
        return underlyingObject;
      },
    } as unknown as Scene;
    const unregister = registerCesiumScenePickExclusionResolver(scene, () => [
      helper,
      alreadyHiddenHelper,
    ]);

    expect(pickCesiumSceneAtPosition(scene, position)).toBe(underlyingObject);
    expect(observedShowStates).toEqual([false, false]);
    expect(helper.show).toBe(true);
    expect(alreadyHiddenHelper.show).toBe(false);

    unregister();
  });
});
