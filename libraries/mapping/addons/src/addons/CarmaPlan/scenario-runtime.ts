import * as THREE from "three";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";

import {
  acquireSharedThreeScene,
  registerSharedThreeSceneRuntime,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";

import type { CarmaPlanScenario } from "./scenario";

const RUNTIME_ID = "carma-plan-scenario";

/**
 * Put a scenario into the map's shared three.js scene. Its geometry is in
 * metres round its anchor; every frame the anchor is projected into the scene
 * and the metres scaled to the scene's, which are metres at the scene's
 * origin. Returns the function that takes it out again. The scenario stays
 * alive, so it can be shown again at once; whoever built it disposes it.
 */
export const mountScenario = (
  map: MaplibreMap,
  scenario: CarmaPlanScenario
): (() => void) => {
  const lease = acquireSharedThreeScene(map);
  const anchor = MercatorCoordinate.fromLngLat(scenario.anchorLngLat, 0);
  // one metre east of the anchor, to read the scene's scale there
  const east = new MercatorCoordinate(
    anchor.x + anchor.meterInMercatorCoordinateUnits(),
    anchor.y,
    0
  ).toLngLat();
  const origin = new THREE.Vector3();
  const unit = new THREE.Vector3();
  const { root } = scenario;
  const runtime: SharedThreeSceneRuntime = {
    id: RUNTIME_ID,
    originLngLat: scenario.anchorLngLat,
    root,
    update: () => {
      if (!lease.layer.projectLngLatToScene(scenario.anchorLngLat, 0, origin))
        return;
      if (!lease.layer.projectLngLatToScene([east.lng, east.lat], 0, unit))
        return;
      root.position.copy(origin);
      root.scale.setScalar(unit.x - origin.x);
    },
    // removing the runtime must not dispose the kept scenario
    dispose: () => undefined,
  };
  lease.layer.addRuntime(runtime);
  const unregister = registerSharedThreeSceneRuntime(map, runtime);
  map.triggerRepaint();
  return () => {
    unregister();
    if (lease.layer.hasRuntime(RUNTIME_ID)) lease.layer.removeRuntime(RUNTIME_ID);
    lease.release();
  };
};
