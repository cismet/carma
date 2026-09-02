// @vitest-environment node

import { SKY_RENDER_ORDER } from "@takram/three-atmosphere";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  ATMOSPHERIC_DISPLAY_EXPOSURE,
  buildAtmosphericSky,
} from "./atmospheric-sky";

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
    expect(sky.mesh.renderOrder).toBe(-SKY_RENDER_ORDER);
    expect(sky.mesh.castShadow).toBe(false);
    expect(sky.mesh.receiveShadow).toBe(false);
    expect(sky.mesh.geometry.getAttribute("position").count).toBe(3);
    expect(sky.mesh.material.side).toBe(THREE.DoubleSide);
    expect(sky.mesh.material.depthTest).toBe(false);
    expect(sky.mesh.material.depthWrite).toBe(false);

    expect(
      sky.update(
        {
          directionToSunECEF: new THREE.Vector3(1, 2, 3).normalize(),
          ecefToSceneMatrix,
          ellipsoidCenterECEF: new THREE.Vector3(-6_371_000, 0, 0),
        },
        {
          transmittanceTexture,
          irradianceTexture,
          scatteringTexture,
        }
      )
    ).toBe(true);

    expect(sky.mesh.visible).toBe(true);
    expect(sky.mesh.material.sun).toBe(true);
    expect(sky.mesh.material.moon).toBe(false);
    expect(sky.mesh.material.photometric).toBe(true);
    expect(sky.mesh.material.fragmentShader).toContain(
      "outputColor = carmaLinearToSrgb(outputColor)"
    );
    expect(sky.mesh.material.uniforms.carmaDisplayExposure.value).toBe(
      ATMOSPHERIC_DISPLAY_EXPOSURE
    );
    sky.mesh.onBeforeRender(
      { getRenderTarget: () => null } as unknown as THREE.WebGLRenderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      sky.mesh.geometry,
      sky.mesh,
      null
    );
    expect(sky.mesh.material.uniforms.carmaOutputToSrgb.value).toBe(true);
    sky.mesh.onBeforeRender(
      {
        getRenderTarget: () => ({}),
      } as unknown as THREE.WebGLRenderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      sky.mesh.geometry,
      sky.mesh,
      null
    );
    expect(sky.mesh.material.uniforms.carmaOutputToSrgb.value).toBe(false);
    expect(sky.mesh.material.transmittanceTexture).toBe(transmittanceTexture);
    expect(sky.mesh.material.irradianceTexture).toBe(irradianceTexture);
    expect(sky.mesh.material.scatteringTexture).toBe(scatteringTexture);
    expect(sky.mesh.material.ellipsoidCenter.toArray()).toEqual([
      -6_371_000, 0, 0,
    ]);
    expect(sky.mesh.material.ellipsoidMatrix.equals(ecefToSceneMatrix)).toBe(
      true
    );
    expect(sky.mesh.material.sunDirection.toArray()).toEqual(
      new THREE.Vector3(1, 2, 3).normalize().toArray()
    );
    sky.updateObserverScenePosition(new THREE.Vector3(40, 475, -20));
    const renderCamera = new THREE.PerspectiveCamera();
    renderCamera.position.set(40, -5_000, -20);
    renderCamera.updateMatrixWorld(true);
    sky.mesh.material.copyCameraSettings(renderCamera);
    expect(sky.mesh.material.uniforms.cameraPosition.value.toArray()).toEqual([
      40, 475, -20,
    ]);
    const viewCamera = new THREE.PerspectiveCamera(55, 16 / 9, 2, 50_000);
    viewCamera.position.set(10, 500, 30);
    viewCamera.lookAt(10, 100, -500);
    viewCamera.updateMatrixWorld(true);
    sky.updateViewCamera(viewCamera);
    sky.mesh.material.onBeforeRender(
      {} as THREE.WebGLRenderer,
      new THREE.Scene(),
      renderCamera,
      sky.mesh.geometry,
      sky.mesh,
      new THREE.Group()
    );
    expect(
      sky.mesh.material.uniforms.inverseProjectionMatrix.value.equals(
        viewCamera.projectionMatrixInverse
      )
    ).toBe(true);
    expect(
      sky.mesh.material.uniforms.inverseViewMatrix.value.equals(
        viewCamera.matrixWorld
      )
    ).toBe(true);
    expect(
      sky.update(
        {
          directionToSunECEF: new THREE.Vector3(Number.NaN, 0, 0),
          ecefToSceneMatrix: new THREE.Matrix4().makeScale(2, 0.5, 1),
          ellipsoidCenterECEF: new THREE.Vector3(),
        },
        {
          transmittanceTexture,
          irradianceTexture,
          scatteringTexture,
        }
      )
    ).toBe(false);
    expect(sky.mesh.material.ellipsoidCenter.toArray()).toEqual([
      -6_371_000, 0, 0,
    ]);

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
