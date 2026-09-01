// @vitest-environment node

import { SKY_RENDER_ORDER } from "@takram/three-atmosphere";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { buildAtmosphericSky } from "./atmospheric-sky";

describe("atmospheric sky", () => {
  it("renders Takram's sky and sun disc in the local tangent frame", () => {
    const initialAlbedo = new THREE.Color("#d8d1c4");
    const sky = buildAtmosphericSky(initialAlbedo);
    const transmittanceTexture = new THREE.DataTexture();
    const irradianceTexture = new THREE.DataTexture();
    const scatteringTexture = new THREE.Data3DTexture();
    const ecefToSceneMatrix = new THREE.Matrix4().makeRotationY(0.3);

    expect(sky.mesh.visible).toBe(false);
    expect(sky.mesh.frustumCulled).toBe(false);
    expect(sky.mesh.renderOrder).toBe(SKY_RENDER_ORDER);
    expect(sky.mesh.castShadow).toBe(false);
    expect(sky.mesh.receiveShadow).toBe(false);

    sky.update(
      {
        directionToSunECEF: new THREE.Vector3(1, 2, 3).normalize(),
        ecefToSceneMatrix,
        observerECEF: new THREE.Vector3(4, 5, 6),
      },
      {
        transmittanceTexture,
        irradianceTexture,
        scatteringTexture,
      }
    );

    expect(sky.mesh.visible).toBe(true);
    expect(sky.mesh.material.sun).toBe(true);
    expect(sky.mesh.material.moon).toBe(false);
    expect(sky.mesh.material.photometric).toBe(false);
    expect(sky.mesh.material.transmittanceTexture).toBe(transmittanceTexture);
    expect(sky.mesh.material.irradianceTexture).toBe(irradianceTexture);
    expect(sky.mesh.material.scatteringTexture).toBe(scatteringTexture);
    expect(sky.mesh.material.ellipsoidCenter.toArray()).toEqual([-4, -5, -6]);
    expect(sky.mesh.material.ellipsoidMatrix.equals(ecefToSceneMatrix)).toBe(
      true
    );
    expect(sky.mesh.material.sunDirection.toArray()).toEqual(
      new THREE.Vector3(1, 2, 3).normalize().toArray()
    );

    const nextAlbedo = new THREE.Color("#eeeeee");
    sky.updateGroundAlbedo(nextAlbedo);
    expect(sky.mesh.material.groundAlbedo.equals(nextAlbedo)).toBe(true);

    const geometryDispose = vi.spyOn(sky.mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(sky.mesh.material, "dispose");
    sky.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
